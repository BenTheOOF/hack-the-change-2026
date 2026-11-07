import httpx
from fastapi import Header, HTTPException

from app.config import settings


async def get_current_user(authorization: str = Header(default="")) -> dict:
    """Return the Supabase user for the bearer token, or raise 401.

    Supabase checks the token for us, so the API needs no JWT secret.
    Use it in any route: `user: dict = Depends(get_current_user)`.
    """
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Missing bearer token")
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={"apikey": settings.supabase_publishable_key, "Authorization": f"Bearer {token}"},
        )
    if r.status_code != 200:
        raise HTTPException(401, "Invalid or expired token")
    return r.json()
