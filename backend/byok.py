# -*- coding: utf-8 -*-
"""
BYOK (Bring Your Own Key) Module
- Encryption/Decryption ของ API Key ด้วย Fernet (Symmetric)
- Model Registry (Free / Premium)
- Key Resolver (ดึง Key ที่เข้ารหัสจาก Supabase แล้วถอดรหัส)
- Dynamic Model Factory (สร้าง ChatOpenAI instance ต่อ request)
"""

import os
import time
import httpx
from typing import Optional, Dict, Any, Tuple
from cryptography.fernet import Fernet, InvalidToken
from langchain_openai import ChatOpenAI
from supabase_client import supabase

# ======================== Encryption ========================

# โหลด ENCRYPTION_KEY จาก .env — ถ้าไม่มีจะ auto-generate (สำหรับ dev เท่านั้น)
_raw_key = os.environ.get("ENCRYPTION_KEY", "")
if not _raw_key:
    print("⚠️  WARNING: ENCRYPTION_KEY not found in .env — generating temporary key (NOT safe for production)")
    _raw_key = Fernet.generate_key().decode()

# Fernet ต้องการ key เป็น bytes ขนาด 32 bytes (base64-encoded)
try:
    _fernet = Fernet(_raw_key.encode() if isinstance(_raw_key, str) else _raw_key)
except Exception as e:
    print(f"❌ ENCRYPTION_KEY format invalid: {e}")
    print("   Generating fallback key...")
    _fernet = Fernet(Fernet.generate_key())


def encrypt_api_key(plain_key: str) -> str:
    """เข้ารหัส API Key แล้ว return เป็น string (base64)"""
    return _fernet.encrypt(plain_key.encode("utf-8")).decode("utf-8")


def decrypt_api_key(encrypted_key: str) -> str:
    """ถอดรหัส API Key กลับเป็น plain text"""
    return _fernet.decrypt(encrypted_key.encode("utf-8")).decode("utf-8")


def mask_api_key(plain_key: str) -> str:
    """Mask key สำหรับแสดงบน UI เช่น sk-or-v1-xxxxx...abcd"""
    if not plain_key:
        return ""
    if len(plain_key) <= 12:
        return plain_key[:4] + "..." + plain_key[-4:]
    return plain_key[:10] + "..." + plain_key[-4:]


# ======================== Model Registry ========================

AVAILABLE_MODELS: Dict[str, Dict[str, Any]] = {
    # --- Free Models (ใช้ได้โดยไม่ต้อง BYOK) ---
    "free-chat": {
        "id": "free-chat",
        "model": os.environ.get("OPENROUTER_MODEL", "openai/gpt-oss-120b:free"),
        "label": "GPT OSS 120B (Free)",
        "provider": "openrouter",
        "requires_byok": False,
        "tier": "free",
        "description": "โมเดลฟรีสำหรับแชทและถามตอบทั่วไป",
    },
    "free-generator": {
        "id": "free-generator",
        "model": os.environ.get("OPENROUTER_GENERATOR_MODEL", "openai/gpt-oss-20b:free"),
        "label": "GPT OSS 20B (Free - Fast)",
        "provider": "openrouter",
        "requires_byok": False,
        "tier": "free",
        "description": "โมเดลฟรีสำหรับ Generation (Quiz/Exam) — เร็วกว่า",
    },
    "free-fallback": {
        "id": "free-fallback",
        "model": os.environ.get("OPENROUTER_FALLBACK_MODEL", "meta-llama/llama-3.3-70b-instruct:free"),
        "label": "Llama 3.3 70B (Free - Fallback)",
        "provider": "openrouter",
        "requires_byok": False,
        "tier": "free",
        "description": "โมเดลสำรองเมื่อโมเดลหลักมีปัญหา",
    },
    # --- Premium Models (ต้องมี BYOK Key) ---
    "gpt-4o": {
        "id": "gpt-4o",
        "model": "openai/gpt-4o",
        "label": "GPT-4o",
        "provider": "openrouter",
        "requires_byok": True,
        "tier": "premium",
        "description": "โมเดลระดับสูงจาก OpenAI — ฉลาดและเร็ว",
    },
    "gpt-4o-mini": {
        "id": "gpt-4o-mini",
        "model": "openai/gpt-4o-mini",
        "label": "GPT-4o Mini",
        "provider": "openrouter",
        "requires_byok": True,
        "tier": "premium",
        "description": "GPT-4o ขนาดเล็ก — ประหยัดกว่าแต่ยังฉลาด",
    },
    "claude-sonnet": {
        "id": "claude-sonnet",
        "model": "anthropic/claude-sonnet-4",
        "label": "Claude Sonnet 4",
        "provider": "openrouter",
        "requires_byok": True,
        "tier": "premium",
        "description": "โมเดลจาก Anthropic — เก่งเรื่องการวิเคราะห์",
    },
    "gemini-pro": {
        "id": "gemini-pro",
        "model": "google/gemini-2.5-pro-preview",
        "label": "Gemini 2.5 Pro",
        "provider": "openrouter",
        "requires_byok": True,
        "tier": "premium",
        "description": "โมเดลจาก Google — รองรับ context ยาวมาก",
    },
}


def get_models_for_user(has_byok: bool) -> list:
    """Return list of models ที่ user สามารถใช้ได้ (ไม่รวม fallback/generator ภายใน)"""
    result = []
    for key, m in AVAILABLE_MODELS.items():
        # ซ่อน internal models (fallback, generator) จาก user
        if key in ("free-fallback", "free-generator"):
            continue
        result.append({
            "id": m["id"],
            "label": m["label"],
            "tier": m["tier"],
            "description": m["description"],
            "requires_byok": m["requires_byok"],
            "locked": m["requires_byok"] and not has_byok,
        })
    return result


# ======================== Key Resolver (Supabase) ========================

# In-memory cache สำหรับลด DB calls (TTL 5 นาที)
_key_cache: Dict[str, Dict[str, Any]] = {}
_KEY_CACHE_TTL = 300  # 5 minutes


def _get_user_settings_from_db(user_id: str) -> Optional[Dict[str, Any]]:
    """ดึง user_settings จาก Supabase"""
    try:
        response = supabase.table("user_settings").select("*").eq("user_id", user_id).execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
    except Exception as e:
        print(f"[BYOK] DB read error for user {user_id}: {e}")
    return None


def get_user_byok_status(user_id: str) -> Dict[str, Any]:
    """ดึงสถานะ BYOK ของ user (ไม่ส่ง key กลับ — ส่งแค่ masked)"""
    settings = _get_user_settings_from_db(user_id)
    if not settings or not settings.get("encrypted_key"):
        return {
            "has_key": False,
            "masked_key": None,
            "is_verified": False,
            "active_model": "free-chat",
        }

    try:
        plain_key = decrypt_api_key(settings["encrypted_key"])
        masked = mask_api_key(plain_key)
    except (InvalidToken, Exception):
        masked = "***invalid***"

    return {
        "has_key": True,
        "masked_key": masked,
        "is_verified": settings.get("is_verified", False),
        "active_model": settings.get("active_model", "free-chat"),
    }


def save_user_key(user_id: str, plain_key: str) -> Dict[str, Any]:
    """เข้ารหัสและบันทึก API Key ลง Supabase"""
    encrypted = encrypt_api_key(plain_key)
    masked = mask_api_key(plain_key)

    data = {
        "user_id": user_id,
        "encrypted_key": encrypted,
        "is_verified": False,
        "active_model": "free-chat",
    }

    try:
        supabase.table("user_settings").upsert(data, on_conflict="user_id").execute()
        # Invalidate cache
        _key_cache.pop(user_id, None)
        return {"success": True, "masked_key": masked}
    except Exception as e:
        print(f"[BYOK] Save key error for user {user_id}: {e}")
        return {"success": False, "error": str(e)}


def update_user_verified(user_id: str, verified: bool):
    """อัปเดตสถานะ verified หลัง verify key สำเร็จ"""
    try:
        supabase.table("user_settings").update({"is_verified": verified}).eq("user_id", user_id).execute()
        _key_cache.pop(user_id, None)
    except Exception as e:
        print(f"[BYOK] Update verified error: {e}")


def update_user_active_model(user_id: str, model_id: str):
    """เปลี่ยน active model ของ user"""
    if model_id not in AVAILABLE_MODELS:
        return {"success": False, "error": f"Unknown model: {model_id}"}
    try:
        supabase.table("user_settings").update({"active_model": model_id}).eq("user_id", user_id).execute()
        _key_cache.pop(user_id, None)
        return {"success": True}
    except Exception as e:
        print(f"[BYOK] Update model error: {e}")
        return {"success": False, "error": str(e)}


def remove_user_key(user_id: str) -> Dict[str, Any]:
    """ลบ API Key ของ user ออกจาก Supabase"""
    try:
        supabase.table("user_settings").update({
            "encrypted_key": None,
            "is_verified": False,
            "active_model": "free-chat",
        }).eq("user_id", user_id).execute()
        _key_cache.pop(user_id, None)
        return {"success": True}
    except Exception as e:
        print(f"[BYOK] Remove key error: {e}")
        return {"success": False, "error": str(e)}


def resolve_api_key(user_id: str) -> Tuple[str, bool]:
    """
    Resolve API key สำหรับ user:
    - Return (api_key, is_byok)
    - ถ้า user มี BYOK key → return (user_key, True)
    - ถ้าไม่มี → return (platform_key, False)
    """
    # Check cache first
    cached = _key_cache.get(user_id)
    if cached and (time.time() - cached["ts"]) < _KEY_CACHE_TTL:
        return cached["key"], cached["is_byok"]

    settings = _get_user_settings_from_db(user_id)
    platform_key = os.environ.get("OPENROUTER_API_KEY", "")

    if settings and settings.get("encrypted_key"):
        try:
            user_key = decrypt_api_key(settings["encrypted_key"])
            _key_cache[user_id] = {"key": user_key, "is_byok": True, "ts": time.time()}
            return user_key, True
        except (InvalidToken, Exception) as e:
            print(f"[BYOK] Decrypt failed for user {user_id}: {e}")

    # Fallback to platform key
    _key_cache[user_id] = {"key": platform_key, "is_byok": False, "ts": time.time()}
    return platform_key, False


def resolve_model_name(user_id: str, purpose: str = "chat") -> str:
    """
    Resolve model name สำหรับ user:
    - purpose: "chat" | "generation" | "fallback"
    - ถ้า user เลือก premium model แต่ไม่มี BYOK → fallback เป็น free
    """
    settings = _get_user_settings_from_db(user_id)
    active_model_id = "free-chat"

    if settings:
        active_model_id = settings.get("active_model", "free-chat")

    model_info = AVAILABLE_MODELS.get(active_model_id)
    if not model_info:
        model_info = AVAILABLE_MODELS["free-chat"]

    # ถ้า model ต้องการ BYOK แต่ user ไม่มี key → fallback
    if model_info["requires_byok"]:
        has_key = settings and settings.get("encrypted_key")
        if not has_key:
            if purpose == "generation":
                return AVAILABLE_MODELS["free-generator"]["model"]
            return AVAILABLE_MODELS["free-chat"]["model"]

    # สำหรับ generation (quiz/exam) → ถ้า user ไม่ได้เลือก premium ก็ใช้ generator model
    if purpose == "generation" and not model_info["requires_byok"]:
        return AVAILABLE_MODELS["free-generator"]["model"]

    return model_info["model"]


# ======================== Dynamic Model Factory ========================

def create_user_model(
    user_id: str,
    purpose: str = "chat",
    temperature: float = 0.7,
    max_tokens: Optional[int] = None,
) -> Tuple[ChatOpenAI, bool]:
    """
    สร้าง ChatOpenAI instance สำหรับ user โดยใช้ resolved key + model
    Return: (model_instance, is_byok)
    """
    api_key, is_byok = resolve_api_key(user_id)
    model_name = resolve_model_name(user_id, purpose)

    # 🚨 SECURITY CHECK: ป้องกันระบบนำ Key ของ Platform ไปจ่ายเงินให้โมเดล Premium
    # ในกรณีที่ Database มี Key แต่ถอดรหัสไม่สำเร็จ (เช่น Server รีสตาร์ทแล้วไม่มี ENCRYPTION_KEY)
    # resolve_api_key จะ fallback ไปใช้ platform_key (is_byok = False)
    # เราต้องเช็คเพื่อบังคับเปลี่ยนโมเดลกลับเป็นตัวฟรีทันที!
    model_info = next((m for m in AVAILABLE_MODELS.values() if m["model"] == model_name), None)
    if model_info and model_info["requires_byok"] and not is_byok:
        print(f"🚨 [SECURITY] Blocked platform key usage for premium model '{model_name}' on user {user_id}. Forcing free model.")
        if purpose == "generation":
            model_name = AVAILABLE_MODELS["free-generator"]["model"]
        else:
            model_name = AVAILABLE_MODELS["free-chat"]["model"]

    kwargs: Dict[str, Any] = {
        "model": model_name,
        "api_key": api_key,
        "base_url": "https://openrouter.ai/api/v1",
        "temperature": temperature,
        "default_headers": {
            "HTTP-Referer": "https://cslearning.app",
            "X-Title": "CSL AI Learning Dashboard",
        },
    }
    if max_tokens:
        kwargs["max_tokens"] = max_tokens

    return ChatOpenAI(**kwargs), is_byok


# ======================== Verify Key ========================

async def verify_openrouter_key(api_key: str) -> Dict[str, Any]:
    """
    ทดสอบ API Key โดยยิง request ง่ายๆ ไปที่ OpenRouter
    ใช้ model ราคาถูกที่สุด เพื่อเช็คว่า key ใช้ได้
    """
    test_model = "google/gemini-2.0-flash-lite-001"  # ราคาถูกมาก
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://cslearning.app",
        "X-Title": "CSL AI Learning Dashboard - Key Verification",
    }
    payload = {
        "model": test_model,
        "messages": [{"role": "user", "content": "Hi"}],
        "max_tokens": 5,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=payload, headers=headers)

        if resp.status_code == 200:
            return {"valid": True, "message": "API Key verified successfully!"}
        elif resp.status_code == 401:
            return {"valid": False, "message": "API Key ไม่ถูกต้อง — กรุณาตรวจสอบ Key อีกครั้ง"}
        elif resp.status_code == 402:
            return {"valid": False, "message": "เครดิตไม่เพียงพอ — กรุณาเติมเครดิตใน OpenRouter"}
        elif resp.status_code == 429:
            return {"valid": False, "message": "ถูกจำกัดอัตราการใช้งาน (Rate Limit) — กรุณารอสักครู่"}
        else:
            body = resp.text[:200]
            return {"valid": False, "message": f"เกิดข้อผิดพลาด ({resp.status_code}): {body}"}
    except httpx.TimeoutException:
        return {"valid": False, "message": "หมดเวลาการเชื่อมต่อ — กรุณาลองใหม่"}
    except Exception as e:
        return {"valid": False, "message": f"เกิดข้อผิดพลาด: {str(e)}"}


# ======================== Error Translator ========================

def translate_openrouter_error(status_code: int, error_body: str = "") -> str:
    """แปลง OpenRouter error codes เป็นข้อความที่เป็นมิตร"""
    messages = {
        401: "API Key ไม่ถูกต้องหรือหมดอายุ — กรุณาตรวจสอบ Key ในหน้า Settings",
        402: "เครดิต OpenRouter ไม่เพียงพอ — กรุณาเติมเครดิตที่ openrouter.ai",
        429: "คนใช้งานเยอะเกินไปจนถูกจำกัด (Rate Limit) — กรุณารอสักครู่แล้วลองใหม่ หรือใส่ API Key ของคุณเองที่หน้าการตั้งค่า (ฟันเฟือง)",
        500: "เซิร์ฟเวอร์ AI มีปัญหาชั่วคราว — กรุณาลองใหม่อีกครั้ง",
        503: "โมเดล AI กำลังโหลด — กรุณารอสักครู่แล้วลองใหม่",
    }
    return messages.get(status_code, f"เกิดข้อผิดพลาดจาก AI Provider (Error {status_code})")
