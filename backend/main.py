# -*- coding: utf-8 -*-
import os
import json
import traceback
import hashlib
import time
import importlib
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Sequence
from typing_extensions import Annotated, TypedDict
from dotenv import load_dotenv
import operator
import io
import markdown
from jinja2 import Environment, FileSystemLoader
# WeasyPrint ต้อง GTK — ใช้ lazy import ในฟังก์ชัน generate_pdf แทน
# from weasyprint import HTML, CSS

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, BaseMessage
from langgraph.graph import StateGraph, START, END
import asyncio

from retriever import get_full_syllabus, get_subject_section, search_lessons_vector
from supabase_client import supabase
from byok import (
    verify_openrouter_key, save_user_key, get_user_byok_status,
    remove_user_key, update_user_verified, update_user_active_model,
    get_models_for_user,
    create_user_model, translate_openrouter_error, AVAILABLE_MODELS,
)

load_dotenv()

app = FastAPI()

# --- Health Check สำหรับ Render / Docker ---
@app.get("/healthz")
async def healthz():
    """Health check endpoint — Render ใช้ตรวจสอบว่า server พร้อมใช้งาน"""
    return {"status": "ok"}

# --- Token Quota Management ---
# ใช้ Supabase เป็นหลัก, in-memory เป็น fallback (รองรับ Cloud deployment ที่ filesystem ไม่ถาวร)
DEFAULT_MAX_TOKENS = 1000000  # 1M tokens limit
_quota_cache: dict = {}  # in-memory fallback

def get_all_quotas():
    """ดึง quota ของ user ทั้งหมด — ลอง Supabase ก่อน, fallback เป็น in-memory"""
    return _quota_cache

def update_user_quota(user_id: str, tokens_used: int, is_paid_model: bool = False):
    """อัปเดต quota ลง Database เสมอ เพื่อความแม่นยำ 100% สำหรับเซิร์ฟเวอร์จริง"""
    current_used = 0
    current_paid_used = 0
    limit_tokens = DEFAULT_MAX_TOKENS
    
    # เวลาท้องถิ่นประเทศไทย (UTC+7)
    thai_time = datetime.now(timezone.utc) + timedelta(hours=7)
    today_str = thai_time.strftime("%Y-%m-%d")
    
    try:
        # 1. ดึงข้อมูลล่าสุดจาก Supabase ก่อนเสมอ
        response = supabase.table('user_quotas').select('used, limit_tokens, last_reset_date, paid_tokens_used').eq('user_id', user_id).execute()
        if response.data:
            db_data = response.data[0]
            current_used = db_data.get("used", 0)
            current_paid_used = db_data.get("paid_tokens_used", 0)
            limit_tokens = db_data.get("limit_tokens", DEFAULT_MAX_TOKENS)
            last_reset_date = db_data.get("last_reset_date")
            
            # ถ้าข้ามวันแล้ว (ขึ้นวันใหม่) ให้รีเซ็ต Token กลับเป็น 0
            if last_reset_date != today_str:
                current_used = 0
            
        # 2. บวก Token ที่ใช้ไป
        new_used = current_used + tokens_used
        new_paid_used = current_paid_used + tokens_used if is_paid_model else current_paid_used
        
        # 3. บันทึกค่าใหม่กลับไปที่ Supabase
        supabase.table('user_quotas').upsert({
            "user_id": user_id,
            "used": new_used,
            "paid_tokens_used": new_paid_used,
            "limit_tokens": limit_tokens,
            "last_reset_date": today_str
        }, on_conflict="user_id").execute()
        
        user_data = {"used": new_used, "limit": limit_tokens, "paidTokensUsed": new_paid_used}
        _quota_cache[user_id] = user_data # อัปเดต in-memory เผื่อไว้ดึงเร็วๆ
        return user_data
    except Exception as e:
        print(f"Quota update to Supabase failed: {e}")
        # Fallback to local if DB is down
        user_data = _quota_cache.get(user_id, {"used": 0, "limit": DEFAULT_MAX_TOKENS, "paidTokensUsed": 0})
        user_data["used"] += tokens_used
        if is_paid_model:
            user_data["paidTokensUsed"] = user_data.get("paidTokensUsed", 0) + tokens_used
        _quota_cache[user_id] = user_data
        return user_data

# Middleware — กำหนด CORS Origins จาก Environment Variable เพื่อความปลอดภัย
# ใช้ค่าเริ่มต้นสำหรับ development (localhost) และเพิ่ม production URL ผ่าน .env
_cors_origins_raw = os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173")
_allowed_origins = [origin.strip() for origin in _cors_origins_raw.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Initialize LLM (OpenRouter) with fallback
primary_model_name = os.environ.get("OPENROUTER_MODEL", "openai/gpt-oss-120b:free")
# โมเดลเฉพาะสำหรับ Generation (เร็วกว่า primary เพราะขนาดเล็กกว่า)
generator_model_name = os.environ.get("OPENROUTER_GENERATOR_MODEL", primary_model_name)
fallback_model_name = os.environ.get("OPENROUTER_FALLBACK_MODEL", "meta-llama/llama-3.3-70b-instruct:free")
api_key = os.environ.get("OPENROUTER_API_KEY", "")

# ดึง APP_URL จาก .env สำหรับ HTTP-Referer header (OpenRouter ใช้ตรวจสอบ origin)
_app_url = os.environ.get("APP_URL", "http://localhost:5173")

print(f"Starting server with model: {primary_model_name} (fallback: {fallback_model_name})")
print(f"Generation model: {generator_model_name}")
print(f"App URL (HTTP-Referer): {_app_url}")

def create_model(model_name: str) -> ChatOpenAI:
    """สร้าง ChatOpenAI model instance สำหรับ chat ทั่วไป"""
    return ChatOpenAI(
        model=model_name,
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
        default_headers={
            "HTTP-Referer": _app_url,
            "X-Title": "CSL AI Learning Dashboard",
        }
    )

model = create_model(primary_model_name)
fallback_model = create_model(fallback_model_name)

# --- โมเดลเฉพาะสำหรับ Generation (เน้นความเร็ว) ---
# ใช้ OPENROUTER_GENERATOR_MODEL จาก .env (inclusionai/ring-2.6-1t:free — เร็วและตอบ JSON ดี)
# max_tokens จำกัด output ให้สั้นเพื่อลดเวลาเจน, temperature ต่ำเพื่อ output ที่คงที่
def create_generation_model(model_name: str) -> ChatOpenAI:
    """สร้าง ChatOpenAI model instance สำหรับ Generation (เน้นความเร็ว)"""
    return ChatOpenAI(
        model=model_name,
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
        temperature=0.3,         # ลดจาก 0.4 เพื่อให้ output คงที่และเร็วขึ้น
        max_tokens=2000,        # เพิ่มกลับเป็น 2000 เพื่อรองรับ Quiz 10 ข้อ/Exam 5 ข้อแบบละเอียด
        default_headers={
            "HTTP-Referer": _app_url,
            "X-Title": "CSL AI Learning Dashboard",
        }
    )

# ใช้ generator_model_name ตัวเดียว ไม่มี fallback เพื่อความเร็ว
generation_model = create_generation_model(generator_model_name)

# --- In-Memory Cache สำหรับผลลัพธ์ที่ Generate แล้ว ---
# key = MD5(type + chapterTitle + content[:300]), value = {"result": ..., "ts": timestamp}
_generation_cache: dict = {}
CACHE_TTL = 3600  # 1 ชั่วโมง

def GetCacheKey(gen_type: str, chapter_title: str, content: str) -> str:
    """สร้าง cache key จาก type + ชื่อบท + เนื้อหา 300 ตัวอักษรแรก"""
    raw = f"{gen_type}:{chapter_title}:{content[:300]}"
    return hashlib.md5(raw.encode('utf-8')).hexdigest()

def GetFromCache(key: str):
    """ดึงข้อมูลจาก cache ถ้ายังไม่หมดอายุ"""
    entry = _generation_cache.get(key)
    if entry and (time.time() - entry["ts"]) < CACHE_TTL:
        return entry["result"]
    return None

def SetCache(key: str, result: dict):
    """บันทึกผลลัพธ์เข้า cache"""
    _generation_cache[key] = {"result": result, "ts": time.time()}

def ClearCache():
    """ล้าง cache ทั้งหมด เมื่อผู้ใช้รีเฟรชหน้าเว็บ"""
    count = len(_generation_cache)
    _generation_cache.clear()
    print(f"--- CACHE CLEARED: {count} entries removed ---")
    return count

# --- Utility: ตัด Context ให้สั้นลงเพื่อลด Token โดยไม่ตัดกลางประโยค ---
MAX_CONTEXT_CHARS = 1200  # ลดจาก 2000 เพื่อเร็วขึ้น — Flashcard 5 ใบไม่ต้องใช้ context มาก

def TrimContext(content: str) -> str:
    """ตัด content ที่ยาวเกินไปที่จุดสิ้นสุดประโยคที่ใกล้ที่สุด"""
    if not content or len(content) <= MAX_CONTEXT_CHARS:
        return content
    trimmed = content[:MAX_CONTEXT_CHARS]
    # หาจุดสิ้นสุดประโยคที่ใกล้ที่สุด (มองย้อนหลัง 200 ตัวอักษร)
    last_period = max(trimmed.rfind('।'), trimmed.rfind('.'), trimmed.rfind('\n'))
    if last_period > MAX_CONTEXT_CHARS - 200:
        trimmed = trimmed[:last_period + 1]
    return trimmed + "\n[...เนื้อหาถูกตัดย่อเพื่อประสิทธิภาพ...]"

def record_llm_token_usage(user_id: str, result, messages, is_byok: bool):
    """ท่อเดียว (Single Pipe) สำหรับบันทึกและแยกประเภท Token Usage"""
    if not user_id:
        return None
        
    tokens_used = 0
    if hasattr(result, "response_metadata"):
        tokens_used = result.response_metadata.get("token_usage", {}).get("total_tokens", 0)
        
    if tokens_used == 0:
        input_chars = sum(len(m.content) for m in messages if hasattr(m, 'content'))
        output_chars = len(result.content) if hasattr(result, "content") else 0
        tokens_used = max(1, (input_chars + output_chars) // 4)
        
    if tokens_used > 0:
        return update_user_quota(user_id, tokens_used, is_paid_model=not is_byok)
    return None

async def invoke_with_fallback(messages, use_model=None, user_id=None):
    """Try primary model first, fallback to secondary if it fails."""
    is_byok = False
    if user_id:
        m, is_byok = create_user_model(user_id, purpose="chat")
    else:
        m = use_model or model
        
    try:
        result = await m.ainvoke(messages)
        record_llm_token_usage(user_id, result, messages, is_byok)
        return result
    except Exception as e:
        error_str = str(e)
        print(f"Primary model error: {error_str[:150]}")
        # If user uses BYOK and gets 401/402, throw directly without fallback
        if is_byok and any(err in error_str for err in ["401", "402"]):
            raise HTTPException(status_code=400, detail=translate_openrouter_error(int(error_str[:3]) if error_str[:3].isdigit() else 401))
            
        # Fallback for common API errors or library internal errors (like TypeError)
        if any(err in error_str for err in ["404", "429", "503", "NoneType", "iterable"]):
            print(f"--- TRYING FALLBACK MODEL: {fallback_model_name} ---")
            fb_result = await fallback_model.ainvoke(messages)
            record_llm_token_usage(user_id, fb_result, messages, is_byok=False)
            return fb_result
        raise

async def InvokeGeneration(messages, user_id=None):
    """ใช้ generation_model เป็นหลัก หากเกิด 429 (Rate Limit) ให้พยายามใช้ fallback_model"""
    is_byok = False
    if user_id:
        gen_m, is_byok = create_user_model(user_id, purpose="generation", temperature=0.3, max_tokens=2000)
    else:
        gen_m = generation_model
        
    try:
        result = await gen_m.ainvoke(messages)
        record_llm_token_usage(user_id, result, messages, is_byok)
        return result
    except Exception as e:
        error_str = str(e)
        if any(err in error_str for err in ["401", "402"]):
            status_code = int(error_str[:3]) if error_str[:3].isdigit() else 401
            # ถ้าเป็น BYOK จะบอกให้เช็คหน้า Setting ถ้าไม่ใช่จะบอกว่าระบบกลางมีปัญหา
            detail_msg = translate_openrouter_error(status_code) if is_byok else "API Key ของระบบกลาง (Platform Key) หมดอายุหรือไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบให้เปลี่ยนคีย์ใน .env"
            raise HTTPException(status_code=400, detail=detail_msg)
            
        if "429" in error_str:
            print(f"Rate limited on primary generation model. Try fallback: {fallback_model_name}")
            fb_result = await fallback_model.ainvoke(messages)
            record_llm_token_usage(user_id, fb_result, messages, is_byok=False)
            return fb_result
        raise

async def invoke_structured_with_fallback(messages, schema, user_id=None):
    """Try structured output with primary model, fallback to secondary."""
    is_byok = False
    if user_id:
        m, is_byok = create_user_model(user_id, purpose="chat")
    else:
        m = model
        
    try:
        structured = m.with_structured_output(schema)
        result = await structured.ainvoke(messages)
        # Note: with_structured_output might not return token metadata directly depending on the model, 
        # but we track what we can.
        record_llm_token_usage(user_id, result, messages, is_byok)
        return result
    except Exception as e:
        error_str = str(e)
        print(f"Structured model error: {error_str[:150]}")
        
        if is_byok and any(err in error_str for err in ["401", "402"]):
            raise HTTPException(status_code=400, detail=translate_openrouter_error(int(error_str[:3]) if error_str[:3].isdigit() else 401))
            
        if any(err in error_str for err in ["404", "429", "503", "NoneType", "iterable"]):
            print(f"--- TRYING STRUCTURED FALLBACK: {fallback_model_name} ---")
            structured_fb = fallback_model.with_structured_output(schema)
            fb_result = await structured_fb.ainvoke(messages)
            record_llm_token_usage(user_id, fb_result, messages, is_byok=False)
            return fb_result
        raise

def parse_json_from_text(text: str) -> Dict[str, Any]:
    """Extract JSON from model output and repair common JSON-like schema echoes."""
    if not text or not text.strip():
        raise ValueError("AI returned an empty response")

    import re

    raw_text = text.strip()
    fence_match = re.search(r"```(?:json)?\s*(.*?)\s*```", raw_text, re.DOTALL | re.IGNORECASE)
    if fence_match:
        raw_text = fence_match.group(1).strip()

    decoder = json.JSONDecoder()
    for start_char in ("{", "["):
        start = raw_text.find(start_char)
        if start == -1:
            continue
        try:
            parsed, _ = decoder.raw_decode(raw_text[start:])
            return parsed
        except json.JSONDecodeError:
            pass

    start_positions = [pos for pos in (raw_text.find("{"), raw_text.find("[")) if pos != -1]
    if start_positions:
        raw_text = raw_text[min(start_positions):]
    end_positions = [pos for pos in (raw_text.rfind("}"), raw_text.rfind("]")) if pos != -1]
    if end_positions:
        raw_text = raw_text[:max(end_positions) + 1]

    raw_text = re.sub(
        r':\s*("[^"]*"\s*(?:\|\s*"[^"]*"\s*)+)',
        lambda m: ": " + re.search(r'"[^"]*"', m.group(1)).group(0),
        raw_text,
    )
    raw_text = re.sub(r":\s*number\b", ": 0", raw_text)
    raw_text = re.sub(r":\s*boolean\b", ": false", raw_text)
    raw_text = re.sub(r":\s*0\s*-\s*100\b", ": 0", raw_text)

    try:
        return json.loads(raw_text.strip())
    except json.JSONDecodeError as e:
        print(f"JSON Parse Error. Raw repaired text: {raw_text[:500]}...")
        raise e

# 2. Schemas for Inputs
class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    userId: Optional[str] = None
    currentLesson: Optional[str] = None

class GenerateRequest(BaseModel):
    chapterTitle: str
    content: Optional[str] = None
    numQuestions: int = 5  # จำนวนข้อที่ต้องการ (5 หรือ 10)
    userId: Optional[str] = None

class GenerateExamRequest(BaseModel):
    chapters: List[Dict[str, str]]
    courseSlug: Optional[str] = None
    batchIdx: int = 0
    numBatches: int = 8
    customInstruction: Optional[str] = None
    userId: Optional[str] = None
    # === Fields ใหม่สำหรับระบบ Exam แบบคละบทและเลือกระดับความยาก ===
    difficultyMode: Optional[str] = "general"
    bloomLevels: Optional[List[str]] = None
    chapterAssignments: Optional[List[str]] = None

class PDFSummaryRequest(BaseModel):
    quizScores: Dict[str, Any]
    examResults: Dict[str, Any]
    radarScores: List[Any]
    userId: Optional[str] = None

class LessonRequest(BaseModel):
    title: str
    content: str
    order_index: int

class CompleteLessonRequest(BaseModel):
    userId: str
    lessonId: str

class SaveScoreRequest(BaseModel):
    userId: str
    lessonId: str
    type: str
    score: int
    totalQuestions: int

class SaveExamResultRequest(BaseModel):
    userId: str
    totalScore: int
    totalQuestions: int
    categoryScores: List[Any]
    recommendation: str

class PDFSection(BaseModel):
    title: str
    content: str

class PDFGenerateRequest(BaseModel):
    title: str
    sections: List[PDFSection]
    score: Optional[int] = None
    total: Optional[int] = None
    chartImage: Optional[str] = None
    footerText: Optional[str] = "CSL AI Learning Dashboard - รายงานอัตโนมัติ"

# --- BYOK Schemas ---
class BYOKSaveRequest(BaseModel):
    userId: str
    apiKey: str

class BYOKVerifyRequest(BaseModel):
    apiKey: str

class BYOKRemoveRequest(BaseModel):
    userId: str

class BYOKSetModelRequest(BaseModel):
    userId: str
    modelId: str

# --- PDF Evaluation Schema ---
# ใช้สำหรับรับข้อมูล PDF ที่สกัดข้อความแล้ว เพื่อส่งให้ AI ประเมินคุณภาพ
class PDFEvaluationRequest(BaseModel):
    text: str  # ข้อความที่สกัดจาก PDF (ส่งมาจาก frontend ผ่าน /api/pdf/extract)
    course_name: Optional[str] = None  # ชื่อวิชา (ถ้ามี — ช่วย AI ประเมินบริบท)
    userId: Optional[str] = None  # ใช้สำหรับติดตาม Token Quota

# Pydantic Schemas for LLM Structured Output
class QuizQuestion(BaseModel):
    question: str = Field(description="The text of the question")
    options: List[str] = Field(description="4 possible choices", min_length=4, max_length=4)
    correctIndex: int = Field(description="Index of the correct option (0-3)", ge=0, le=3)
    domain: str = Field(description="Bloom's Taxonomy cognitive domain for this question (Remember, Understand, Apply, Analyze, Evaluate, Create)")

class QuizSchema(BaseModel):
    questions: List[QuizQuestion]

class Flashcard(BaseModel):
    front: str = Field(description="The question or term on the front of the flashcard")
    back: str = Field(description="The answer or definition on the back of the flashcard")

class FlashcardSchema(BaseModel):
    cards: List[Flashcard]

class ExamQuestion(BaseModel):
    question: str = Field(description="The text of the question")
    options: List[str] = Field(description="4 possible choices", min_length=4, max_length=4)
    correctIndex: int = Field(description="Index of the correct option (0-3)", ge=0, le=3)
    domain: str = Field(description="Bloom's Taxonomy cognitive domain")
    chapterTitle: str = Field(description="The chapter this question belongs to")

class ExamSchema(BaseModel):
    questions: List[ExamQuestion]

# 3. Define the Graph State using TypedDict (required for LangGraph Python)
# ใช้ total=False เพื่อให้ current_lesson เป็น optional field (รองรับ Python 3.8+)
class _AgentStateRequired(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]
    context: str

class AgentState(_AgentStateRequired, total=False):
    current_lesson: Optional[str]
    user_id: Optional[str]

# 4. Load syllabus once at startup
_syllabus_context = get_full_syllabus()

# 5. Define Nodes
async def retrieve_node(state: AgentState):
    last_message = state["messages"][-1].content
    current_lesson = state.get("current_lesson")
    print(f"---CHAT QUESTION: {last_message[:80]} (Lesson: {current_lesson})---")
    # Pass current_lesson as a primary focus for context retrieval
    relevant_context = await get_subject_section(last_message, lesson_focus=current_lesson)
    return {"context": relevant_context}

async def generate_node(state: AgentState):
    print("---GENERATING RESPONSE---")
    
    # Extract frontend-provided system prompt if exists to merge contexts
    frontend_context = ""
    clean_messages = []
    for m in state["messages"]:
        if isinstance(m, SystemMessage):
            frontend_context += f"\n{m.content}"
        else:
            clean_messages.append(m)

    system_prompt = f"""You are an expert Computer Science AI Tutor. Your communication style must be direct, concise, and helpful. Follow these strict rules:

1. Match Length to Question: If the user asks a simple question, provide a short, direct answer (1-3 sentences). Only provide detailed explanations for complex questions or when explicitly requested.
2. No Filler: Never use introductory or concluding filler phrases (e.g., do NOT say 'Sure, I can help with that', 'Here is the answer', or 'In conclusion'). Answer immediately.
3. Be Scannable: Use bullet points, bold text for key terms, and short paragraphs to make the information easy to scan.
4. Stop Over-explaining: Do not provide unprompted background information unless it is absolutely critical to the answer. Give the user the core concept and let them ask follow-up questions if they need more details.
5. Language: Always respond in Thai (ภาษาไทย), but keep technical terms in English.

{frontend_context}

=== ข้อมูลประกอบ (Context) ===
{state.get('context', '')}
=== จบข้อมูลประกอบ ==="""

    messages = [SystemMessage(content=system_prompt)] + clean_messages
    user_id = state.get('user_id')
    response = await invoke_with_fallback(messages, user_id=user_id)
    return {"messages": [response]}

# 6. Assemble the Graph
workflow = StateGraph(AgentState)
workflow.add_node("retrieve", retrieve_node)
workflow.add_node("generate", generate_node)
workflow.add_edge(START, "retrieve")
workflow.add_edge("retrieve", "generate")
workflow.add_edge("generate", END)

app_graph = workflow.compile()

# Convert pydantic messages to langchain messages
def convert_messages(messages: List[Message]) -> List[BaseMessage]:
    lc_messages = []
    for msg in messages:
        if msg.role == "user":
            lc_messages.append(HumanMessage(content=msg.content))
        elif msg.role == "assistant" or msg.role == "ai":
            lc_messages.append(AIMessage(content=msg.content))
        elif msg.role == "system":
            lc_messages.append(SystemMessage(content=msg.content))
    return lc_messages


# --- API Routes ---


@app.post("/api/chat")
async def chat(request: ChatRequest):
    if not request.messages:
        raise HTTPException(status_code=400, detail="Messages array is required")
    
    lc_messages = convert_messages(request.messages)
    
    try:
        # Invoke LangGraph
        result = await app_graph.ainvoke({
            "messages": lc_messages, 
            "context": "",
            "current_lesson": request.currentLesson,
            "user_id": request.userId
        })
        
        last_message = result["messages"][-1]
        
        # Save to Supabase
        current_user_id = request.userId or 'anonymous'
        
        # (Token tracking is now handled automatically by the single pipe in invoke_with_fallback)

        user_msg = request.messages[-1].content
        
        try:
            supabase.table('chat_history').insert([
                {"user_id": current_user_id, "sender": "user", "message": user_msg},
                {"user_id": current_user_id, "sender": "ai", "message": last_message.content}
            ]).execute()
        except Exception as db_err:
            print("Supabase Save Error (Chat):", db_err)
        
        return {"reply": {"role": "assistant", "content": last_message.content}}
        
    except Exception as e:
        print("LangGraph Error:", e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    if not request.messages:
        raise HTTPException(status_code=400, detail="Messages array is required")
    
    lc_messages = convert_messages(request.messages)
    current_user_id = request.userId or 'anonymous'
    user_msg = request.messages[-1].content

    async def generate_stream():
        full_response = ""
        try:
            input_state = {
                "messages": lc_messages, 
                "context": "",
                "current_lesson": request.currentLesson,
                "user_id": request.userId
            }
            async for event in app_graph.astream_events(input_state, version="v2"):
                if event["event"] == "on_chat_model_stream":
                    chunk = event["data"]["chunk"].content
                    if chunk and isinstance(chunk, str):
                        full_response += chunk
                        yield chunk
                elif event["event"] == "on_chat_model_end":
                    pass # Token tracking is now handled automatically by the single pipe
            
            # After stream finishes, the quota is updated. Send it to frontend.
            user_quota = _quota_cache.get(current_user_id)
            if user_quota:
                yield f"\n__USAGE__:{json.dumps(user_quota)}"
            
            
            # Save to Supabase after stream finished
            try:
                supabase.table('chat_history').insert([
                    {"user_id": current_user_id, "sender": "user", "message": user_msg},
                    {"user_id": current_user_id, "sender": "ai", "message": full_response}
                ]).execute()
            except Exception as db_err:
                print("Supabase Save Error (Stream):", db_err)
            
        except Exception as e:
            print("LangGraph Stream Error:", e)
            traceback.print_exc()
            yield f"\n[Error occurred during streaming: {str(e)}]"

    return StreamingResponse(generate_stream(), media_type="text/plain")


@app.post("/api/generate-quiz")
async def generate_quiz(request: GenerateRequest):
    try:
        start_time = time.time()
        num_q = request.numQuestions if request.numQuestions in [5, 10] else 5
        mode = "Single 5" if num_q == 5 else "Parallel 5+5"
        print(f"--- กำลังสร้าง QUIZ ({mode}) สำหรับ: {request.chapterTitle} ---")
        
        # 1. เตรียม Context
        context = request.content
        if not context or len(context.strip()) < 50:
            context = await search_lessons_vector(request.chapterTitle, limit=10)
            if not context:
                context = await get_subject_section(request.chapterTitle)
        context = TrimContext(context)

        # 2. ฟังก์ชันภายในสำหรับเจนแต่ละชุด (ชุดละ 5 ข้อ)
        async def fetch_quiz_batch(batch_num: int):
            batch_prompt = f"""You are a Computer Science educator. Create 5 multiple-choice questions about: {request.chapterTitle}.
Rules: Use ONLY the Context below. Write in Thai. Keep English technical terms.
Each question: 4 options, 1 correct, include explanation.
JSON format:
{{
  "questions": [
    {{"question": "str", "options": ["a","b","c","d"], "correctIndex": 0, "domain": "Understand", "explanation": "str"}}
  ]
}}

Context:
{context}"""
            
            for attempt in range(2):
                try:
                    result = await InvokeGeneration([SystemMessage(content=batch_prompt)], user_id=request.userId)
                    questions = parse_json_from_text(result.content).get("questions", [])
                    return questions
                except Exception as e:
                    print(f"  [Quiz Batch {batch_num}] attempt {attempt+1} failed: {e}")
                    if attempt < 1: await asyncio.sleep(1)
            return []

        # 3. รันตาม numQuestions
        if num_q == 5:
            # รัน batch เดียว (เร็วกว่า ~2x)
            all_questions = await fetch_quiz_batch(1)
        else:
            # รัน 2 batches พร้อมกัน (Parallel)
            tasks = [fetch_quiz_batch(1), fetch_quiz_batch(2)]
            results = await asyncio.gather(*tasks)
            all_questions = []
            for batch_questions in results:
                all_questions.extend(batch_questions)
                
            
        print(f"--- QUIZ DONE: {len(all_questions)} questions in {time.time()-start_time:.2f}s ---")
        return {"questions": all_questions}
        
    except Exception as e:
        print("Quiz Parallel Generation Error:", e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clear-cache")
async def clear_cache():
    """ล้าง In-Memory Cache ทั้งหมด — เรียกเมื่อผู้ใช้รีเฟรชหน้าเว็บ"""
    count = ClearCache()
    return {"cleared": count}


@app.post("/api/generate-flashcards")
async def generate_flashcards(request: GenerateRequest):
    try:
        start_time = time.time()
        print(f"--- กำลังสร้าง FLASHCARDS (Parallel 3+2) สำหรับ: {request.chapterTitle} ---")
        
        # 1. เตรียม Context
        context = request.content
        if not context or len(context.strip()) < 50:
            context = await search_lessons_vector(request.chapterTitle, limit=10)
            if not context:
                context = await get_subject_section(request.chapterTitle)
        context = TrimContext(context)

        # 2. ฟังก์ชันภายในสำหรับเจนแต่ละชุด
        async def fetch_cards_batch(count: int):
            batch_prompt = f"""You are a teacher. Create {count} flashcards (front/back) about: {request.chapterTitle}.
Rules: Thai only. Use natural sentences (Subject-Verb-Object). No '+'. 
Format: Short question on front, short answer on back. Recall-focused.
JSON format:
{{
  "cards": [
    {{"front": "คำถาม?", "back": "คำตอบ"}}
  ]
}}

Context:
{context}"""
            
            for attempt in range(2):
                try:
                    result = await InvokeGeneration([SystemMessage(content=batch_prompt)], user_id=request.userId)
                    cards = parse_json_from_text(result.content).get("cards", [])
                    return cards
                except Exception as e:
                    print(f"  [Flashcard Batch {count}] attempt {attempt+1} failed: {e}")
                    if attempt < 1: await asyncio.sleep(1)
            return []

        # 3. รันแบบเดี่ยว 5 ข้อ รวดเดียวเพื่อหลีกเลี่ยง Rate Limit ของ API ฟรี
        all_cards = await fetch_cards_batch(5)
            
        print(f"--- FLASHCARDS DONE: {len(all_cards)} cards in {time.time()-start_time:.2f}s ---")
        return {"cards": all_cards}
        
    except Exception as e:
        print("Flashcard Parallel Generation Error:", e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/generate-exam")
async def generate_exam(request: GenerateExamRequest):
    """สร้างข้อสอบ 5 ข้อต่อ batch โดยคละบทเรียนตาม chapterAssignments (Round-Robin)
    และปรับ Bloom's Taxonomy ตาม difficultyMode ที่ผู้ใช้เลือก"""
    if not request.chapters:
        raise HTTPException(status_code=400, detail="chapters array is required")

    try:
        batch_idx = request.batchIdx
        num_batches = request.numBatches
        batch_size = 5
        difficulty_mode = request.difficultyMode or "general"
        bloom_levels = request.bloomLevels or []
        chapter_assignments = request.chapterAssignments or []
        
        print(f"--- กำลังสร้างข้อสอบ BATCH {batch_idx + 1}/{num_batches} (mode={difficulty_mode}) ---")
        
        # === 1. กำหนด Bloom domains สำหรับแต่ละข้อตาม difficultyMode ===
        if difficulty_mode == "bloom" and bloom_levels:
            # ผู้ใช้เลือก Bloom levels เอง → วนเวียนระดับที่เลือกให้ครบ batch_size
            target_domains = [bloom_levels[i % len(bloom_levels)] for i in range(batch_size)]
        elif difficulty_mode == "difficult":
            # โหมดยาก → เน้น Apply ขึ้นไป
            hard_pool = ['Apply', 'Analyze', 'Evaluate', 'Create']
            target_domains = [hard_pool[i % len(hard_pool)] for i in range(batch_size)]
        else:
            # โหมดทั่วไป → คละ Bloom ทุกระดับอย่างสมดุล
            general_pool = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create']
            # ใช้ batch_idx เป็น offset เพื่อให้แต่ละ batch ไม่ซ้ำรูปแบบ
            offset = batch_idx * batch_size
            target_domains = [general_pool[(offset + i) % len(general_pool)] for i in range(batch_size)]

        # === 2. เตรียม context จากหลายบทตาม chapterAssignments (Round-Robin) ===
        if chapter_assignments and len(chapter_assignments) == batch_size:
            # ใช้ chapterAssignments ที่ Frontend ส่งมา (แต่ละข้อมีบทกำกับ)
            question_chapters = chapter_assignments
        else:
            # Fallback: ใช้บทเดียวตาม batchIdx (ระบบเดิม)
            chapter_titles = [c.get("title", "") for c in request.chapters]
            fallback_title = chapter_titles[batch_idx % len(chapter_titles)]
            question_chapters = [fallback_title] * batch_size
        
        # รวม context จากทุกบทที่ไม่ซ้ำกันใน batch นี้
        unique_chapter_names = list(dict.fromkeys(question_chapters))  # รักษาลำดับ
        combined_context = ""
        for ch_title in unique_chapter_names:
            ch_data = next((c for c in request.chapters if c.get("title") == ch_title), None)
            if ch_data:
                content = ch_data.get("content", "")
                if not content or len(content.strip()) < 50:
                    content = await search_lessons_vector(ch_title, limit=6, course_slug=request.courseSlug)
                content = TrimContext(content)
                combined_context += f"\n\n=== บทเรียน: {ch_title} ===\n{content}"
        
        # === 3. สร้าง Prompt ที่ระบุบทและ Bloom domain สำหรับแต่ละข้อ ===
        custom_rules = ""
        if request.customInstruction:
            custom_rules = f"\n\nUSER REQUEST: {request.customInstruction}\nAdjust the difficulty, focus, or style accordingly."

        # สร้างรายการกำหนดข้อ → บท + domain
        question_specs = "\n".join([
            f"Question {i+1}: chapter=\"{question_chapters[i]}\", domain=\"{target_domains[i]}\""
            for i in range(batch_size)
        ])

        prompt = f"""You are an expert Computer Science examiner.
Create exactly {batch_size} multiple-choice questions. Each question MUST be based on the specific chapter and cognitive domain assigned below.
CRITICAL RULE 1: You MUST ONLY use the provided Context sections. DO NOT use any outside knowledge.
CRITICAL RULE 2: Each question MUST come from its assigned chapter. Use the content under that chapter's section.
CRITICAL RULE 3: Every question and option MUST be written in complete grammatical sentences.{custom_rules}

Question Assignments (chapter and Bloom's Taxonomy domain for each question):
{question_specs}

Requirements for each question:
- exactly 4 options
- a correctIndex (0-3)
- the assigned domain from the list above
- chapterTitle must match the assigned chapter exactly

IMPORTANT:
1. All questions and options MUST be written in Thai language.
2. Use English for technical terms (e.g., "Encapsulation", "Polymorphism").
3. Do NOT translate technical terms into Thai.
4. Ensure the questions are challenging and accurate based on the context.

You MUST respond ONLY with a valid JSON object:
{{
  "questions": [
    {{
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correctIndex": number,
      "domain": "string",
      "chapterTitle": "string",
      "explanation": "string (อธิบายเหตุผลว่าทำไมถึงตอบข้อนี้อย่างกระชับ)"
    }}
  ]
}}

Context:
{combined_context}"""

        # ตรวจสอบ Cache (ข้าม Cache ถ้ามี customInstruction)
        cache_key = GetCacheKey("exam", str(question_chapters), combined_context[:200] + str(batch_idx) + difficulty_mode)
        if not request.customInstruction:
            cached = GetFromCache(cache_key)
            if cached:
                print(f"--- CACHE HIT: Exam Batch {batch_idx} [{', '.join(unique_chapter_names[:3])}...] ---")
                return cached

        result = await InvokeGeneration([SystemMessage(content=prompt)], user_id=request.userId)
        batch_data = parse_json_from_text(result.content)
        SetCache(cache_key, batch_data)
        # (Token tracking is now handled automatically by the single pipe in InvokeGeneration)
            
        print(f"--- EXAM BATCH {batch_idx + 1} DONE: {len(batch_data.get('questions', []))} questions from {len(unique_chapter_names)} chapters ---")
        return batch_data
        
    except Exception as e:
        print(f"Exam Generation Error (Batch {request.batchIdx}):", e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/generate-pdf-summary")
async def generate_pdf_summary(request: PDFSummaryRequest):
    try:
        print("---GENERATING PDF SUMMARY---")

        prompt = f"""You are an expert education analyst. 
Analyze the performance data and create a HIGHLY DETAILED and COMPREHENSIVE summary report in Thai.
Do NOT limit the word count. Feel free to write as much as needed to provide deep insights.

Data:
- Score: {request.examResults.get('score')} / {request.examResults.get('total')}
- Topics: {json.dumps(request.quizScores, ensure_ascii=False)}
- Skills (Bloom's Taxonomy): {json.dumps(request.radarScores, ensure_ascii=False)}

Requirements:
1. Use rich Markdown formatting (H2, H3, bold text, and bullet points).
2. Structure the report logically with main headings and subheadings.
3. Provide a deep analysis of their strengths based on the topic scores and Bloom's taxonomy domains.
4. Provide highly specific, actionable recommendations on what they need to improve and how they can do it.
5. EXTREMELY IMPORTANT: Use a highly professional, natural human tone (Professional Human Tone). Do NOT use any emojis. Do NOT use repetitive or robotic phrases (e.g., "จากผลการประเมินพบว่า", "ขอแสดงความยินดี"). Write as if an expert human teacher is giving thoughtful advice to a student.
6. CRITICAL MATHEMATICAL CONSISTENCY: Carefully analyze the scores and percentages for each Bloom's Taxonomy domain in the provided data. Your analysis must be 100% mathematically correct and consistent with these numbers. For example, if "Evaluate" has 57% and "Remember" has 25%, you must NOT describe "Remember" as a strength or as "having a good score" compared to "Evaluate". You must correctly identify which cognitive levels are actually strong (highest percentages) and which are actually weak (lowest percentages), and construct your summary and analysis accordingly. Do not hallucinate or make contradictory statements.
7. USE STANDARD MARKDOWN TABLES: When presenting structured lists of items with scores/percentages and descriptions (such as the list of Bloom's Taxonomy domains with their scores and meanings), ALWAYS format them as a standard Markdown table. Do NOT use raw spaces or tabs for alignment, as they do not render consistently on different devices. Use the following format for tables:
   | ระดับ Bloom | คะแนน % | ความหมายของคะแนน |
   | :--- | :---: | :--- |
   | [Bloom Domain Name] | [Score]% | [Meaning of Score] |

Structure:
## สรุปภาพรวมผลการประเมิน (Overall Performance)
- (Write a detailed paragraph analyzing their overall score and what it implies about their understanding in a natural tone)

## วิเคราะห์จุดแข็งและความเชี่ยวชาญ (Strengths & Expertise)
### วิเคราะห์รายหัวข้อ (Topic Analysis)
- (Bullet points detailing strong topics)
### วิเคราะห์ทักษะการคิด (Cognitive Skills)
- (Bullet points detailing strong Bloom's taxonomy domains)

## จุดที่ควรพัฒนาและข้อเสนอแนะ (Areas for Improvement & Recommendations)
### หัวข้อที่ควรทบทวนเพิ่มเติม (Topics to Review)
- (Bullet points with specific advice on weak topics)
### ทักษะที่ควรฝึกฝนเพิ่ม (Skills to Practice)
- (Bullet points with specific advice on weak Bloom's taxonomy domains)

Respond ONLY with the Markdown Thai text. Do not include any emojis or conversational filler."""


        response = await invoke_with_fallback([SystemMessage(content=prompt)], user_id=request.userId)
        return {"summary": response.content}
        
    except Exception as e:
        print("PDF Summary Error:", e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-pdf")
async def generate_pdf(request: PDFGenerateRequest):
    try:
        # Lazy import — WeasyPrint ต้องการ GTK system library
        from weasyprint import HTML, CSS
        print(f"---GENERATING MODERN PDF: {request.title}---")
        
        # 1. Prepare data for template
        template_data = {
            "title": request.title,
            "date": datetime.now().strftime("%d/%m/%Y"),
            "score": request.score,
            "total": request.total,
            "sections": [],
            "chart_image": request.chartImage,
            "footer_text": request.footerText
        }
        
        # 2. Process sections (convert markdown to HTML)
        # เปิดใช้งาน extension 'tables' เพื่อพาร์สและจัดรูปเล่มตาราง Markdown และ 'nl2br' เพื่อเว้นบรรทัดอย่างเป็นธรรมชาติ
        for sec in request.sections:
            html_content = markdown.markdown(sec.content, extensions=['tables', 'nl2br'])
            # สั่งขึ้นหน้าใหม่ถ้าเจอหัวข้อ "สรุปเนื้อหารายวิชา"
            is_highlights = "สรุปเนื้อหารายวิชา" in sec.title
            
            template_data["sections"].append({
                "title": sec.title,
                "content": html_content,
                "page_break": is_highlights
            })
            
        # 3. Render HTML using Jinja2
        env = Environment(loader=FileSystemLoader('.'))
        template = env.get_template('templates/pdf_template.html')
        rendered_html = template.render(template_data)
        
        # 4. Generate PDF using WeasyPrint
        # Note: base_url is set to current directory to resolve font paths
        pdf_file = io.BytesIO()
        HTML(string=rendered_html, base_url=".").write_pdf(target=pdf_file)
        pdf_file.seek(0)
        
        return Response(
            content=pdf_file.getvalue(),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=report.pdf"
            }
        )
        
    except Exception as e:
        print("PDF Generation Error:", e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/pdf/extract")
async def extract_pdf_text(file: UploadFile = File(...)):
    """
    สกัดข้อความภาษาไทยและอังกฤษจากไฟล์ PDF แบบ In-Memory ปลอดภัยสูง
    พร้อมระบบป้องกันด้านความปลอดภัยและการตรวจสอบโครงสร้างไฟล์
    """
    # 1. ตรวจสอบประเภทไฟล์เบื้องต้น
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="กรุณาอัปโหลดไฟล์ที่มีนามสกุล .pdf เท่านั้น")
    
    # 2. ตรวจสอบขนาดไฟล์เพื่อความปลอดภัย (จำกัด 10MB)
    max_file_size = 10 * 1024 * 1024  # 10 MB
    try:
        import pypdf

        file_content = await file.read()
        if len(file_content) > max_file_size:
            raise HTTPException(status_code=400, detail="ขนาดไฟล์ PDF ต้องไม่เกิน 10MB เพื่อความรวดเร็วและปลอดภัย")
        
        # 3. ประมวลผล PDF แบบ In-Memory โดยใช้ pypdf
        pdf_stream = io.BytesIO(file_content)
        pdf_reader = pypdf.PdfReader(pdf_stream)
        
        extracted_text_list = []
        
        # กำหนดค่าเริ่มต้นเพื่อหลีกเลี่ยงข้อผิดพลาด 'possibly unbound' ใน IDE
        Image = None
        pytesseract = None
        
        # Lazy import เพื่อให้แน่ใจว่าทำงานได้แม้ในระบบที่ไม่มี Tesseract ตอนเริ่มแอพ
        try:
            import pytesseract
            from PIL import Image
            ocr_available = True
        except ImportError:
            ocr_available = False
            print("WARNING: pytesseract or Pillow not installed. Image OCR will be skipped.")

        # สแกนทีละหน้าและสกัดคำ
        for page_num in range(len(pdf_reader.pages)):
            page = pdf_reader.pages[page_num]
            
            # 1. ดึงข้อความปกติจาก Text Layer
            page_text = page.extract_text() or ""
            
            # 2. ค้นหารูปภาพในหน้าและทำ OCR
            ocr_texts = []
            if ocr_available and Image is not None and pytesseract is not None and hasattr(page, 'images'):
                # pypdf 3.x+ ใช้ list/tuple, ขณะที่ PyPDF2 ใช้ dict — รองรับทั้งสองรูปแบบ
                images_list = page.images.values() if isinstance(page.images, dict) else page.images
                for count, image_file_object in enumerate(images_list):
                    try:
                        # ใช้ getattr เพื่อดึงข้อมูลไบต์และหลีกเลี่ยง AttributeError หรือ Type Check Error
                        image_data = getattr(image_file_object, 'data', None)
                        if not image_data:
                            continue
                            
                        img = Image.open(io.BytesIO(image_data))
                        # แปลงภาพเป็นข้อความด้วย Tesseract
                        ocr_text = pytesseract.image_to_string(img, lang='tha+eng')
                        if ocr_text and ocr_text.strip():
                            ocr_texts.append(ocr_text.strip())
                    except Exception as e:
                        print(f"Failed to OCR image on page {page_num}: {e}")
                        pass
            
            # 3. นำข้อความมารวมกัน
            if ocr_texts:
                if page_text.strip():
                    page_text += "\n\n[ข้อความที่อ่านได้จากรูปภาพในหน้านี้]:\n" + "\n---\n".join(ocr_texts)
                else:
                    page_text = "\n---\n".join(ocr_texts)
                    
            if page_text and page_text.strip():
                extracted_text_list.append(page_text.strip())
        
        extracted_text = "\n\n".join(extracted_text_list).strip()
        
        # 4. ป้องกันปัญหาสแกนไฟล์เปล่าหรือสแกนรูปภาพที่ไม่มีข้อความดิบ (เช่น PDF Scanned)
        if not extracted_text:
            raise HTTPException(
                status_code=400, 
                detail="ไม่พบข้อความในไฟล์ PDF นี้ (ไฟล์อาจเป็นรูปภาพสแกนที่ความละเอียดต่ำเกินไป หรือไม่มีตัวอักษรเลย) กรุณาลองใช้ไฟล์ PDF อื่นครับ"
            )
        
        # ส่งคืนข้อความที่สกัดได้
        return {"text": extracted_text}
        
    except HTTPException as http_exc:
        raise http_exc
    except Exception as exc:
        print(f"Error extracting PDF text: {exc}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="ไม่สามารถอ่านหรือวิเคราะห์ไฟล์ PDF นี้ได้ กรุณาตรวจสอบว่าไฟล์ไม่เสียหาย")

@app.get("/api/user-quota/{userId}")
async def get_user_quota(userId: str):
    thai_time = datetime.now(timezone.utc) + timedelta(hours=7)
    today_str = thai_time.strftime("%Y-%m-%d")
    
    try:
        # Try fetching from Supabase first
        response = supabase.table('user_quotas').select('*').eq('user_id', userId).execute()
        if response.data:
            db_data = response.data[0]
            used = db_data.get("used", 0)
            paid_tokens_used = db_data.get("paid_tokens_used", 0)
            limit_tokens = db_data.get("limit_tokens", DEFAULT_MAX_TOKENS)
            last_reset_date = db_data.get("last_reset_date")
            
            if last_reset_date != today_str:
                used = 0
                # บันทึกค่า 0 กลับลงฐานข้อมูลทันทีเมื่อพบว่าข้ามวันแล้ว
                try:
                    supabase.table('user_quotas').upsert({
                        "user_id": userId,
                        "used": 0,
                        "paid_tokens_used": paid_tokens_used,
                        "limit_tokens": limit_tokens,
                        "last_reset_date": today_str
                    }, on_conflict="user_id").execute()
                except Exception as db_err:
                    print(f"Failed to reset quota in DB for {userId}: {db_err}")
                
            user_data = {"used": used, "limit": limit_tokens, "paidTokensUsed": paid_tokens_used}
            # Sync to in-memory cache
            _quota_cache[userId] = user_data
            return user_data
    except Exception as e:
        print(f"Failed to fetch quota from Supabase for {userId}: {e}")
        
    # Fallback to in-memory cache
    quotas = get_all_quotas()
    user_data = quotas.get(userId, {"used": 0, "limit": DEFAULT_MAX_TOKENS, "paidTokensUsed": 0})
    return user_data

# --- SUPABASE ROUTES ---

async def ExecuteWithRetry(query_builder, retries_left=3, delay_seconds=0.5, backoff_factor=2):
    # รัน Supabase Query พร้อมกลไก Retry และ Exponential Backoff เพื่อความเสถียรของระบบ
    # ใช้ asyncio.sleep แทน time.sleep เพื่อไม่ block event loop
    last_error = None
    for attempt in range(retries_left):
        try:
            return query_builder.execute()
        except Exception as error:
            last_error = error
            print(f"[RETRY] Supabase query failed: {error}. Attempt {attempt + 1} of {retries_left}...")
            if attempt < retries_left - 1:
                await asyncio.sleep(delay_seconds)
                delay_seconds *= backoff_factor
    raise last_error

@app.get("/api/lessons")
async def get_lessons(course_slug: Optional[str] = None):
    try:
        # กำหนดคำสั่งคิวรีดึงข้อมูลบทเรียนจากตาราง curriculum_content
        query = supabase.table('curriculum_content').select('*').order('chapter_number').order('id')
        if course_slug:
            query = query.eq('course_slug', course_slug)
        # รันคิวรีด้วยฟังก์ชัน ExecuteWithRetry เพื่อป้องกันปัญหา Timeout หรือ Network Fluctuation
        response = await ExecuteWithRetry(query, retries_left=3, delay_seconds=0.5, backoff_factor=2)
        return response.data
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/lessons")
async def add_lesson(request: LessonRequest):
    try:
        response = supabase.table('curriculum_content').insert([
            {"chapter_title": request.title, "dropdown_content": request.content, "chapter_number": request.order_index, "year": 1, "course_slug": "custom", "course_title": "Custom", "dropdown_header": "Custom"}
        ]).execute()
        return response.data[0] if response.data else None
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/complete-lesson")
async def complete_lesson(request: CompleteLessonRequest):
    try:
        response = supabase.table('user_progress').upsert({
            "user_id": request.userId,
            "lesson_id": request.lessonId,
            "is_completed": True,
            "completed_at": datetime.utcnow().isoformat()
        }, on_conflict="user_id,lesson_id").execute()
        return {"message": "Lesson marked as completed", "data": response.data}
    except Exception as e:
        print(f"Error in complete_lesson (user: {request.userId}, lesson: {request.lessonId}):", e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/user-progress/{userId}")
async def get_user_progress(userId: str):
    try:
        response = supabase.table('user_progress').select('lesson_id').eq('user_id', userId).eq('is_completed', True).execute()
        return [d['lesson_id'] for d in response.data]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/save-score")
async def save_score(request: SaveScoreRequest):
    print(f"DEBUG: Saving score for user {request.userId}, lesson {request.lessonId}, type {request.type}, score {request.score}/{request.totalQuestions}")
    try:
        # 1. Save score to lesson_scores
        score_res = supabase.table('lesson_scores').insert([{
            "user_id": request.userId,
            "lesson_id": request.lessonId,
            "type": request.type,
            "score": request.score,
            "total_questions": request.totalQuestions
        }]).execute()
        
        # 2. Also mark as completed in user_progress
        try:
            supabase.table('user_progress').upsert({
                "user_id": request.userId,
                "lesson_id": request.lessonId,
                "is_completed": True,
                "completed_at": datetime.utcnow().isoformat()
            }, on_conflict="user_id,lesson_id").execute()
            print(f"DEBUG: Progress updated for {request.userId}")
        except Exception as prog_err:
            print(f"DEBUG: Error updating progress (non-critical): {prog_err}")

        return {"message": "Score and progress saved successfully", "data": score_res.data}
    except Exception as e:
        print(f"DEBUG: Error saving score: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/save-exam-result")
async def save_exam_result(request: SaveExamResultRequest):
    try:
        response = supabase.table('exam_results').insert([{
            "user_id": request.userId,
            "total_score": request.totalScore,
            "total_questions": request.totalQuestions,
            "category_scores": request.categoryScores,
            "recommendation": request.recommendation
        }]).execute()
        return {"message": "Exam result saved successfully", "data": response.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ================================================================
# BYOK (Bring Your Own Key) API Endpoints
# ================================================================

@app.post("/api/byok/verify")
async def byok_verify(request: BYOKVerifyRequest):
    """ทดสอบ API Key โดยยิง request ไปที่ OpenRouter"""
    if not request.apiKey or len(request.apiKey.strip()) < 10:
        raise HTTPException(status_code=400, detail="API Key ไม่ถูกต้อง")
    result = await verify_openrouter_key(request.apiKey.strip())
    return result


@app.post("/api/byok/save")
async def byok_save(request: BYOKSaveRequest):
    """เข้ารหัสและบันทึก API Key ลง Supabase"""
    if not request.userId:
        raise HTTPException(status_code=400, detail="userId is required")
    if not request.apiKey or len(request.apiKey.strip()) < 10:
        raise HTTPException(status_code=400, detail="API Key ไม่ถูกต้อง")
    result = save_user_key(request.userId, request.apiKey.strip())
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Failed to save key"))
    # Mark as verified if we saved successfully
    update_user_verified(request.userId, True)
    result["is_verified"] = True
    return result


@app.get("/api/byok/status/{userId}")
async def byok_status(userId: str):
    """ดึงสถานะ BYOK ของ user (ไม่ส่ง key กลับ — ส่งแค่ masked)"""
    return get_user_byok_status(userId)


@app.post("/api/byok/remove")
async def byok_remove(request: BYOKRemoveRequest):
    """ลบ API Key ของ user"""
    if not request.userId:
        raise HTTPException(status_code=400, detail="userId is required")
    return remove_user_key(request.userId)


@app.get("/api/byok/models/{userId}")
async def byok_models(userId: str):
    """ดึงรายชื่อ models ที่ user ใช้ได้ (ตาม BYOK status)"""
    status = get_user_byok_status(userId)
    models = get_models_for_user(status["has_key"])
    return {
        "models": models,
        "active_model": status.get("active_model", "free-chat"),
        "has_byok": status["has_key"],
    }


@app.post("/api/byok/set-model")
async def byok_set_model(request: BYOKSetModelRequest):
    """เปลี่ยน active model ของ user"""
    if not request.userId:
        raise HTTPException(status_code=400, detail="userId is required")
    # ตรวจสอบว่า model ที่เลือกต้องการ BYOK หรือไม่
    model_info = AVAILABLE_MODELS.get(request.modelId)
    if not model_info:
        raise HTTPException(status_code=400, detail=f"Unknown model: {request.modelId}")
    if model_info["requires_byok"]:
        status = get_user_byok_status(request.userId)
        if not status["has_key"]:
            raise HTTPException(status_code=403, detail="ต้องเพิ่ม API Key ก่อนถึงจะใช้ Premium Model ได้")
    return update_user_active_model(request.userId, request.modelId)


# ================================================================
# PDF Evaluation — วิเคราะห์คุณภาพเนื้อหา PDF สำหรับสร้างบทเรียนและข้อสอบ
# ================================================================

# ค่าคงที่สำหรับการตัดข้อความ PDF ขนาดใหญ่ให้พอดีกับ Context Limit ของ LLM
MAX_PDF_EVAL_CHARS = 15000  # จำนวนตัวอักษรสูงสุดที่ส่งให้ AI ประเมิน

def SamplePdfContent(text: str, max_chars: int = MAX_PDF_EVAL_CHARS) -> str:
    """สุ่มตัวอย่างเนื้อหา PDF โดยดึงจากส่วนต้น กลาง ท้าย เพื่อให้ครอบคลุมเนื้อหาทั้งหมด
    ลดปัญหา Token เกิน Context Limit สำหรับ PDF ที่มีความยาวมาก (สูงสุด 200 หน้า)
    """
    if not text or len(text) <= max_chars:
        return text

    # แบ่งเนื้อหาเป็น 3 ส่วน: ต้น กลาง ท้าย
    third = max_chars // 3
    beginning = text[:third]
    middle_start = (len(text) // 2) - (third // 2)
    middle = text[middle_start:middle_start + third]
    ending = text[-(third):]

    sampled = (
        f"[ส่วนต้นของเอกสาร]\n{beginning}\n\n"
        f"[ส่วนกลางของเอกสาร]\n{middle}\n\n"
        f"[ส่วนท้ายของเอกสาร]\n{ending}"
    )
    return sampled


@app.post("/api/pdf/evaluate")
async def evaluate_pdf_quality(request: PDFEvaluationRequest):
    """ประเมินคุณภาพเนื้อหา PDF สำหรับสร้างบทเรียนและข้อสอบ 40 ข้อ
    วิเคราะห์ 4 ด้าน: ความยาวเนื้อหา, Bloom's Taxonomy 6 ด้าน,
    ความเพียงพอสำหรับข้อสอบ 40 ข้อ, และคุณภาพโดยรวม
    """
    # 1. ตรวจสอบว่ามีเนื้อหาเพียงพอสำหรับการวิเคราะห์
    if not request.text or len(request.text.strip()) < 100:
        raise HTTPException(
            status_code=400,
            detail="เนื้อหา PDF สั้นเกินไป (ต้องมีอย่างน้อย 100 ตัวอักษร) กรุณาอัปโหลด PDF ที่มีเนื้อหามากกว่านี้"
        )

    try:
        start_time = time.time()
        raw_text = request.text.strip()

        # 2. คำนวณ metadata เบื้องต้น (จำนวนคำ, จำนวนหน้าโดยประมาณ)
        word_count = len(raw_text.split())
        page_estimate = max(1, word_count // 300)  # ประมาณ 300 คำต่อหน้า

        # 3. ตัดเนื้อหาให้เหมาะสมกับ LLM (Sampling สำหรับ PDF ขนาดใหญ่)
        sampled_text = SamplePdfContent(raw_text, MAX_PDF_EVAL_CHARS)
        is_sampled = len(raw_text) > MAX_PDF_EVAL_CHARS

        # 4. กำหนดชื่อวิชา (ถ้ามี)
        course_context = f"\nชื่อวิชา: {request.course_name}" if request.course_name else ""

        # 5. สร้าง AI Prompt สำหรับการวิเคราะห์คุณภาพ
        eval_prompt = f"""คุณเป็นผู้เชี่ยวชาญด้านการศึกษาและการออกแบบหลักสูตร (Instructional Design Expert)
ให้วิเคราะห์เนื้อหาจากไฟล์ PDF ด้านล่างนี้ว่ามีคุณภาพเพียงพอสำหรับ:
1. ใช้เป็นเนื้อหาบทเรียน (Lesson Content)
2. สร้างข้อสอบ Multiple-Choice ได้ 40 ข้อ ที่ครอบคลุม Bloom's Taxonomy 6 ระดับ

ข้อมูลเอกสาร:
- จำนวนคำทั้งหมด: {word_count} คำ
- จำนวนหน้าโดยประมาณ: {page_estimate} หน้า
- เนื้อหาถูกสุ่มตัวอย่าง: {"ใช่ (เนื้อหายาวเกิน จึงดึงมาเฉพาะส่วนต้น กลาง ท้าย)" if is_sampled else "ไม่ (ส่งมาทั้งหมด)"}{course_context}

คุณต้องตอบกลับเป็น JSON เท่านั้น ตามรูปแบบนี้:
{{
  "content_length": {{
    "word_count": {word_count},
    "page_estimate": {page_estimate},
    "verdict": "สั้นไป" | "พอดี" | "ยาวไป",
    "detail": "อธิบายสั้นๆ ว่าทำไม"
  }},
  "bloom_taxonomy": {{
    "remember": {{ "score": 0-100, "found_indicators": ["..."], "verdict": "ดี" | "พอใช้" | "ต้องปรับปรุง" }},
    "understand": {{ "score": 0-100, "found_indicators": ["..."], "verdict": "..." }},
    "apply": {{ "score": 0-100, "found_indicators": ["..."], "verdict": "..." }},
    "analyze": {{ "score": 0-100, "found_indicators": ["..."], "verdict": "..." }},
    "evaluate": {{ "score": 0-100, "found_indicators": ["..."], "verdict": "..." }},
    "create": {{ "score": 0-100, "found_indicators": ["..."], "verdict": "..." }}
  }},
  "exam_readiness": {{
    "estimated_questions": number,
    "target_questions": 40,
    "is_sufficient": boolean,
    "detail": "อธิบายว่าทำไมถึงสร้างข้อสอบได้/ไม่ได้ 40 ข้อ"
  }},
  "overall": {{
    "quality_score": 0-100,
    "is_passed": boolean,
    "verdict": "ผ่าน — ... " | "ไม่ผ่าน — ...",
    "recommendations": ["คำแนะนำที่ 1", "คำแนะนำที่ 2", "..."]
  }}
}}

CRITICAL: ตอบเป็น JSON ล้วนเท่านั้น ห้ามมี markdown, code fence, หรือข้อความอื่นใด

เนื้อหา PDF:
{sampled_text}"""

        # 6. ส่งให้ AI วิเคราะห์ผ่าน InvokeGeneration
        print(f"--- กำลังประเมินคุณภาพ PDF: {word_count} คำ, ~{page_estimate} หน้า (sampled: {is_sampled}) ---")
        result = await InvokeGeneration(
            [SystemMessage(content=eval_prompt)],
            user_id=request.userId
        )

        # 7. แยกข้อมูล JSON จากผลลัพธ์ AI
        evaluation = parse_json_from_text(result.content)

        elapsed = time.time() - start_time
        print(f"--- PDF EVALUATION DONE: quality_score={evaluation.get('overall', {}).get('quality_score', '?')} in {elapsed:.2f}s ---")

        return {"evaluation": evaluation}

    except json.JSONDecodeError as e:
        print(f"PDF Evaluation JSON Parse Error: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="AI ส่งข้อมูลกลับมาในรูปแบบที่ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง"
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"PDF Evaluation Error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"เกิดข้อผิดพลาดในการประเมิน PDF: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 5000))
    print(f"Starting server with model: {primary_model_name} (fallback: {fallback_model_name})")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
