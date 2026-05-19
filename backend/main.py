# -*- coding: utf-8 -*-
import os
import json
import traceback
import hashlib
import time
from datetime import datetime
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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
from fastapi.responses import Response

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, BaseMessage
from langgraph.graph import StateGraph, START, END
import random
import asyncio

from retriever import get_retriever, get_full_syllabus, get_subject_section, search_lessons_vector
from supabase_client import supabase

load_dotenv()

app = FastAPI()

# --- Health Check สำหรับ Render / Docker ---
@app.get("/healthz")
async def healthz():
    """Health check endpoint — Render ใช้ตรวจสอบว่า server พร้อมใช้งาน"""
    return {"status": "ok"}

# --- Token Quota Management ---
# ใช้ Supabase เป็นหลัก, in-memory เป็น fallback (รองรับ Cloud deployment ที่ filesystem ไม่ถาวร)
DEFAULT_MAX_TOKENS = 100000  # 100k tokens limit
_quota_cache: dict = {}  # in-memory fallback

def get_all_quotas():
    """ดึง quota ของ user ทั้งหมด — ลอง Supabase ก่อน, fallback เป็น in-memory"""
    return _quota_cache

def update_user_quota(user_id: str, tokens_used: int):
    """อัปเดต quota ลง Database เสมอ เพื่อความแม่นยำ 100% สำหรับเซิร์ฟเวอร์จริง"""
    current_used = 0
    limit_tokens = DEFAULT_MAX_TOKENS
    
    try:
        # 1. ดึงข้อมูลล่าสุดจาก Supabase ก่อนเสมอ
        response = supabase.table('user_quotas').select('used, limit_tokens').eq('user_id', user_id).execute()
        if response.data:
            current_used = response.data[0].get("used", 0)
            limit_tokens = response.data[0].get("limit_tokens", DEFAULT_MAX_TOKENS)
            
        # 2. บวก Token ที่ใช้ไป
        new_used = current_used + tokens_used
        
        # 3. บันทึกค่าใหม่กลับไปที่ Supabase
        supabase.table('user_quotas').upsert({
            "user_id": user_id,
            "used": new_used,
            "limit_tokens": limit_tokens
        }, on_conflict="user_id").execute()
        
        user_data = {"used": new_used, "limit": limit_tokens}
        _quota_cache[user_id] = user_data # อัปเดต in-memory เผื่อไว้ดึงเร็วๆ
        return user_data
    except Exception as e:
        print(f"Quota update to Supabase failed: {e}")
        # Fallback to local if DB is down
        user_data = _quota_cache.get(user_id, {"used": 0, "limit": DEFAULT_MAX_TOKENS})
        user_data["used"] += tokens_used
        _quota_cache[user_id] = user_data
        return user_data

    return user_data

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

print(f"Starting server with model: {primary_model_name} (fallback: {fallback_model_name})")
print(f"Generation model: {generator_model_name}")

def create_model(model_name: str) -> ChatOpenAI:
    return ChatOpenAI(
        model=model_name,
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
        default_headers={
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "CSL AI Learning Dashboard",
        }
    )

model = create_model(primary_model_name)
fallback_model = create_model(fallback_model_name)

# --- โมเดลเฉพาะสำหรับ Generation (เน้นความเร็ว) ---
# ใช้ OPENROUTER_GENERATOR_MODEL จาก .env (inclusionai/ring-2.6-1t:free — เร็วและตอบ JSON ดี)
# max_tokens จำกัด output ให้สั้นเพื่อลดเวลาเจน, temperature ต่ำเพื่อ output ที่คงที่
def create_generation_model(model_name: str) -> ChatOpenAI:
    return ChatOpenAI(
        model=model_name,
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
        temperature=0.3,         # ลดจาก 0.4 เพื่อให้ output คงที่และเร็วขึ้น
        max_tokens=2000,        # เพิ่มกลับเป็น 2000 เพื่อรองรับ Quiz 10 ข้อ/Exam 5 ข้อแบบละเอียด
        default_headers={
            "HTTP-Referer": "http://localhost:5173",
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

async def invoke_with_fallback(messages, use_model=None):
    """Try primary model first, fallback to secondary if it fails."""
    m = use_model or model
    try:
        return await m.ainvoke(messages)
    except Exception as e:
        error_str = str(e)
        print(f"Primary model error: {error_str[:150]}")
        # Fallback for common API errors or library internal errors (like TypeError)
        if any(err in error_str for err in ["404", "429", "503", "NoneType", "iterable"]):
            print(f"--- TRYING FALLBACK MODEL: {fallback_model_name} ---")
            return await fallback_model.ainvoke(messages)
        raise

async def InvokeGeneration(messages):
    """ใช้ generation_model (ring-2.6-1t) ตรงๆ ไม่มี fallback เพื่อความเร็วสูงสุด
    ถ้าเกิด error ให้ raise ขึ้นไปจัดการที่ caller แทน
    """
    return await generation_model.ainvoke(messages)

async def invoke_structured_with_fallback(messages, schema):
    """Try structured output with primary model, fallback to secondary."""
    try:
        structured = model.with_structured_output(schema)
        return await structured.ainvoke(messages)
    except Exception as e:
        error_str = str(e)
        print(f"Structured model error: {error_str[:150]}")
        if any(err in error_str for err in ["404", "429", "503", "NoneType", "iterable"]):
            print(f"--- TRYING STRUCTURED FALLBACK: {fallback_model_name} ---")
            structured_fb = fallback_model.with_structured_output(schema)
            return await structured_fb.ainvoke(messages)
        raise

def parse_json_from_text(text: str) -> Dict[str, Any]:
    """Extract and parse JSON from a string that might contain markdown blocks."""
    if not text or not text.strip():
        raise ValueError("AI ส่ง response ว่างเปล่ากลับมา")
    
    import re
    raw_text = text.strip()
    
    # พยายามดึงเฉพาะก้อน JSON ออกมา (จาก { ถึง })
    match = re.search(r'\{.*\}', raw_text, re.DOTALL)
    if match:
        raw_text = match.group(0)
    else:
        # ถ้าหาไม่เจอ ลองดึงแบบ array [ ถึง ]
        match_arr = re.search(r'\[.*\]', raw_text, re.DOTALL)
        if match_arr:
            raw_text = match_arr.group(0)
            
    raw_text = raw_text.strip()
    
    if not raw_text:
        raise ValueError(f"ไม่พบ JSON ใน response: {text[:200]}")
        
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError as e:
        print(f"JSON Parse Error. Raw extracted text: {raw_text[:200]}...")
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

class PDFSummaryRequest(BaseModel):
    quizScores: Dict[str, Any]
    examResults: Dict[str, Any]
    radarScores: List[Any]

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
    response = await invoke_with_fallback(messages)
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
            "current_lesson": request.currentLesson
        })
        
        last_message = result["messages"][-1]
        
        # Save to Supabase
        current_user_id = request.userId or 'anonymous'
        
        # Extract token usage and update quota
        tokens_used = 0
        if hasattr(last_message, "response_metadata"):
            tokens_used = last_message.response_metadata.get("token_usage", {}).get("total_tokens", 0)
            
        if tokens_used == 0:
            input_chars = sum(len(m.content) for m in lc_messages)
            output_chars = len(last_message.content)
            tokens_used = max(1, (input_chars + output_chars) // 4)
        
        if tokens_used > 0:
            update_user_quota(current_user_id, tokens_used)

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
                "current_lesson": request.currentLesson
            }
            async for event in app_graph.astream_events(input_state, version="v2"):
                if event["event"] == "on_chat_model_stream":
                    chunk = event["data"]["chunk"].content
                    if chunk and isinstance(chunk, str):
                        full_response += chunk
                        yield chunk
                elif event["event"] == "on_chat_model_end":
                    usage = event["data"]["output"].response_metadata.get("token_usage", {})
                    tokens_used = usage.get("total_tokens", 0)
                    
                    # Fallback token estimation if provider doesn't return usage in stream
                    if tokens_used == 0:
                        input_chars = sum(len(m.content) for m in lc_messages)
                        output_chars = len(full_response)
                        tokens_used = max(1, (input_chars + output_chars) // 4)
                        
                    if tokens_used > 0:
                        user_quota = update_user_quota(current_user_id, tokens_used)
                        # ส่งข้อมูล usage ไปที่ frontend แบบเงียบๆ (ใช้ delimiter)
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
                    result = await InvokeGeneration([SystemMessage(content=batch_prompt)])
                    questions = parse_json_from_text(result.content).get("questions", [])
                    tokens_used = 0
                    if hasattr(result, "response_metadata"):
                        tokens_used = result.response_metadata.get("token_usage", {}).get("total_tokens", 0)
                    if tokens_used == 0:
                        tokens_used = max(1, (len(batch_prompt) + len(result.content)) // 4)
                    return questions, tokens_used
                except Exception as e:
                    print(f"  [Quiz Batch {batch_num}] attempt {attempt+1} failed: {e}")
                    if attempt < 1: await asyncio.sleep(1)
            return [], 0

        # 3. รันตาม numQuestions
        if num_q == 5:
            # รัน batch เดียว (เร็วกว่า ~2x)
            all_questions, total_tokens = await fetch_quiz_batch(1)
        else:
            # รัน 2 batches พร้อมกัน (Parallel)
            tasks = [fetch_quiz_batch(1), fetch_quiz_batch(2)]
            results = await asyncio.gather(*tasks)
            all_questions = []
            total_tokens = 0
            for batch_questions, batch_tokens in results:
                all_questions.extend(batch_questions)
                total_tokens += batch_tokens
            
        if request.userId:
            update_user_quota(request.userId, total_tokens)
            
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
                    result = await InvokeGeneration([SystemMessage(content=batch_prompt)])
                    cards = parse_json_from_text(result.content).get("cards", [])
                    tokens_used = 0
                    if hasattr(result, "response_metadata"):
                        tokens_used = result.response_metadata.get("token_usage", {}).get("total_tokens", 0)
                    if tokens_used == 0:
                        tokens_used = max(1, (len(batch_prompt) + len(result.content)) // 4)
                    return cards, tokens_used
                except Exception as e:
                    print(f"  [Flashcard Batch {count}] attempt {attempt+1} failed: {e}")
                    if attempt < 1: await asyncio.sleep(1)
            return [], 0

        # 3. รันแบบเดี่ยว 5 ข้อ รวดเดียวเพื่อหลีกเลี่ยง Rate Limit ของ API ฟรี
        all_cards, total_tokens = await fetch_cards_batch(5)
            
        if request.userId:
            update_user_quota(request.userId, total_tokens)
            
        print(f"--- FLASHCARDS DONE: {len(all_cards)} cards in {time.time()-start_time:.2f}s ---")
        return {"cards": all_cards}
        
    except Exception as e:
        print("Flashcard Parallel Generation Error:", e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/generate-exam")
async def generate_exam(request: GenerateExamRequest):
    # ตรวจสอบว่ามีการส่งบทเรียนมาหรือไม่
    if not request.chapters:
        raise HTTPException(status_code=400, detail="chapters array is required")

    try:
        batch_idx = request.batchIdx
        num_batches = request.numBatches
        batch_size = 5
        
        print(f"--- กำลังสร้างข้อสอบ BATCH {batch_idx + 1}/{num_batches} ---")
        
        # เตรียมรายชื่อบทเรียน
        chapter_titles = [c.get("title", "") for c in request.chapters]
        
        # เลือกบทเรียนหลักสำหรับ Batch นี้
        current_chapter_title = chapter_titles[batch_idx % len(chapter_titles)]
        
        # ใช้เนื้อหาเต็มจากที่หน้าเว็บส่งมาเป็นหลัก เพื่อให้อ่านครบทุกหัวข้อย่อย
        chapter_data = next((c for c in request.chapters if c.get("title") == current_chapter_title), None)
        context = chapter_data.get("content", "") if chapter_data else ""
        
        # Fallback หากไม่มีเนื้อหา ค่อยใช้ Vector Search
        if not context or len(context.strip()) < 50:
            context = await search_lessons_vector(current_chapter_title, limit=8, course_slug=request.courseSlug)

        # ตัด Context ที่ยาวเกินไปเพื่อลด Token
        context = TrimContext(context)

        # กำหนดสัดส่วน Bloom's Taxonomy ทั้งหมด 40 ข้อ (แบบผสมเพื่อให้กระจายทุกบทเรียน)
        # Remember: 6, Understand: 8, Apply: 10, Analyze: 8, Evaluate: 4, Create: 4
        bloom_distribution = [
            'Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 
            'Create', 'Remember', 'Understand', 'Apply', 'Analyze',
            'Apply', 'Understand', 'Analyze', 'Remember', 'Apply',
            'Understand', 'Analyze', 'Apply', 'Remember', 'Understand',
            'Apply', 'Analyze', 'Evaluate', 'Create', 'Apply',
            'Understand', 'Analyze', 'Apply', 'Remember', 'Understand',
            'Apply', 'Analyze', 'Evaluate', 'Create', 'Apply',
            'Understand', 'Analyze', 'Evaluate', 'Create', 'Remember'
        ]
        
        # เลือก Domain สำหรับ Batch นี้ (5 ข้อ)
        start_idx = batch_idx * batch_size
        end_idx = start_idx + batch_size
        target_domains = bloom_distribution[start_idx:end_idx]
        
        # หากมีคำสั่งพิเศษ (customInstruction) จากผู้ใช้ ให้นำมาเพิ่มเป็นกฎพิเศษ
        custom_rules = ""
        if request.customInstruction:
            custom_rules = f"\n\nUSER REQUEST FOR THESE QUESTIONS: {request.customInstruction}\nMake sure to adjust the difficulty, focus, or style of the questions according to this request while still following the general format."

        prompt = f"""You are an expert Computer Science examiner.
Create exactly {batch_size} multiple-choice questions based strictly on the provided context.
Focus on the topic: {current_chapter_title}.
CRITICAL RULE 1: You MUST ONLY use the provided Context. DO NOT use any outside knowledge.
CRITICAL RULE 2: You MUST distribute the questions evenly across the different concepts in the context.
CRITICAL RULE 3: Every question and option MUST be written in complete grammatical sentences (Subject + Verb + Object) to ensure maximum clarity.{custom_rules}

Each question must strictly follow these assigned cognitive domains from Bloom's Taxonomy in order:
{", ".join([f"Question {i+1}: {domain}" for i, domain in enumerate(target_domains)])}

Requirements for each question:
- exactly 4 options
- a correctIndex (0-3)
- the assigned domain from the list above
- a chapterTitle: "{current_chapter_title}"

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
{context}"""

        # ตรวจสอบ Cache สำหรับ Exam Batch นี้ (ถ้ามี customInstruction ให้ข้าม Cache เพื่อเจนใหม่เสมอ)
        cache_key = GetCacheKey("exam", current_chapter_title, context + str(batch_idx) + str(request.customInstruction or ""))
        if not request.customInstruction:
            cached = GetFromCache(cache_key)
            if cached:
                print(f"--- CACHE HIT: Exam Batch {batch_idx} [{current_chapter_title}] ---")
                return cached

        # ใช้ generation_model (temperature=0) เพื่อความเร็ว
        result = await InvokeGeneration([SystemMessage(content=prompt)])
        batch_data = parse_json_from_text(result.content)
        SetCache(cache_key, batch_data)
        
        # Calculate actual tokens
        tokens_used = 0
        if hasattr(result, "response_metadata"):
            tokens_used = result.response_metadata.get("token_usage", {}).get("total_tokens", 0)
        if tokens_used == 0:
            tokens_used = max(1, (len(prompt) + len(result.content)) // 4)
            
        if request.userId:
            update_user_quota(request.userId, tokens_used)
            
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


        response = await invoke_with_fallback([SystemMessage(content=prompt)])
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
        for sec in request.sections:
            html_content = markdown.markdown(sec.content)
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

@app.get("/api/user-quota/{userId}")
async def get_user_quota(userId: str):
    try:
        # Try fetching from Supabase first
        response = supabase.table('user_quotas').select('*').eq('user_id', userId).execute()
        if response.data:
            db_data = response.data[0]
            user_data = {"used": db_data.get("used", 0), "limit": db_data.get("limit_tokens", DEFAULT_MAX_TOKENS)}
            # Sync to in-memory cache
            _quota_cache[userId] = user_data
            return user_data
    except Exception as e:
        print(f"Failed to fetch quota from Supabase for {userId}: {e}")
        
    # Fallback to in-memory cache
    quotas = get_all_quotas()
    user_data = quotas.get(userId, {"used": 0, "limit": DEFAULT_MAX_TOKENS})
    return user_data

# --- SUPABASE ROUTES ---

@app.get("/api/lessons")
async def get_lessons(course_slug: Optional[str] = None):
    try:
        query = supabase.table('curriculum_content').select('*').order('chapter_number').order('id')
        if course_slug:
            query = query.eq('course_slug', course_slug)
        response = query.execute()
        return response.data
    except Exception as e:
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

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 5000))
    print(f"Starting server with model: {primary_model_name} (fallback: {fallback_model_name})")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
