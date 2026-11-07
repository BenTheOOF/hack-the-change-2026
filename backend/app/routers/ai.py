import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.config import settings

router = APIRouter()

# Requests per user per UTC day. Edit here to change it.
DAILY_LIMIT = 20


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


@router.post("/ai/chat")
async def chat(body: ChatIn, user: dict = Depends(get_current_user)):
    if not settings.llm_api_key or not settings.llm_model:
        raise HTTPException(503, "Set ANTHROPIC_API_KEY and LLM_MODEL in .env")

    async with httpx.AsyncClient(timeout=60) as client:
        # Counts the request before calling the LLM, so failed calls use up the quota too.
        # The secret key goes in the apikey header only, never in Authorization.
        usage = await client.post(
            f"{settings.supabase_url}/rest/v1/rpc/increment_ai_usage",
            headers={"apikey": settings.supabase_secret_key},
            json={"p_user": user["id"]},
        )
        if usage.status_code != 200:
            raise HTTPException(502, "Could not check the daily limit")
        if usage.json() > DAILY_LIMIT:
            raise HTTPException(429, f"Daily limit of {DAILY_LIMIT} requests reached")

        r = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.llm_api_key,
                "anthropic-version": "2026-10-21",
            },
            json={
                "model": settings.llm_model,
                "max_tokens": settings.llm_max_tokens,
                "messages": [{"role": "user", "content": body.message}],
            },
        )
    if r.status_code != 200:
        raise HTTPException(502, "The LLM provider returned an error")
    blocks = r.json()["content"]
    return {"reply": "".join(b["text"] for b in blocks if b["type"] == "text")}
