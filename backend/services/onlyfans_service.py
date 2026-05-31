import httpx
import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

OFAPI_BASE_URL = os.getenv("OFAPI_BASE_URL", "https://app.onlyfansapi.com")
OFAPI_KEY = os.getenv("OFAPI_KEY", "")


def _headers():
    return {
        "Authorization": f"Bearer {OFAPI_KEY}",
        "Content-Type": "application/json",
    }


async def list_connected_accounts() -> list:
    """GET /api/accounts — returns all connected OF accounts with their acct_ IDs."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{OFAPI_BASE_URL}/api/accounts",
            headers=_headers(),
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        return data.get("data", data) if isinstance(data, dict) else data


async def get_account_me(account_id: str) -> dict:
    """GET /api/{account}/me — profile info for a connected account."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{OFAPI_BASE_URL}/api/{account_id}/me",
            headers=_headers(),
            timeout=30,
        )
        r.raise_for_status()
        return r.json()


async def get_fans(account_id: str, offset: int = 0, limit: int = 20) -> dict:
    """GET /api/{account}/fans/all — paginated list of fans.
    Returns {"fans": [...], "has_more": bool}"""
    safe_limit = max(1, min(limit, 50))
    params: dict = {"limit": safe_limit}
    if offset > 0:
        params["offset"] = offset
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{OFAPI_BASE_URL}/api/{account_id}/fans/all",
            headers=_headers(),
            params=params,
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()

    # Response: {"data": {"list": [...], "hasMore": bool}}
    inner = data.get("data", {}) if isinstance(data, dict) else {}
    if isinstance(inner, list):
        fans = inner
        has_more = len(fans) == safe_limit
    else:
        fans = inner.get("list") or inner.get("data") or []
        has_more = bool(inner.get("hasMore") or inner.get("has_more", False))

    return {"fans": fans, "has_more": has_more}


async def get_active_fans(account_id: str, offset: int = 0, limit: int = 20) -> dict:
    """GET /api/{account}/fans/active — active subscribers only."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{OFAPI_BASE_URL}/api/{account_id}/fans/active",
            headers=_headers(),
            params={"offset": offset, "limit": limit},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()


async def get_chats(account_id: str, offset: int = 0, limit: int = 20) -> dict:
    """GET /api/{account}/chats — list all chats."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{OFAPI_BASE_URL}/api/{account_id}/chats",
            headers=_headers(),
            # params={"offset": offset, "limit": limit},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()


async def get_chat_messages(
    account_id: str, chat_id: str, cursor_id: Optional[str] = None, limit: int = 100
) -> dict:
    """GET /api/{account}/chats/{chat_id}/messages
    Default order=desc (newest first). Use `id` param to paginate to older messages."""
    params: dict = {"limit": limit}
    if cursor_id:
        params["first_id"] = cursor_id  # cursor: oldest msg id on previous page
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{OFAPI_BASE_URL}/api/{account_id}/chats/{chat_id}/messages",
            headers=_headers(),
            params=params,
            timeout=30,
        )
        r.raise_for_status()
        return r.json()


async def send_message(
    account_id: str,
    chat_id: str,
    content: str,
    price: Optional[float] = None,
) -> dict:
    """POST /api/{account}/chats/{chat_id}/messages — send a message."""
    payload: dict = {"text": content}
    if price:
        payload["price"] = price
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{OFAPI_BASE_URL}/api/{account_id}/chats/{chat_id}/messages",
            headers=_headers(),
            json=payload,
            timeout=30,
        )
        r.raise_for_status()
        return r.json()


async def send_typing_indicator(account_id: str, chat_id: str) -> dict:
    """POST /api/{account}/chats/{chat_id}/typing — shows 'Model is typing...' to the fan."""
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{OFAPI_BASE_URL}/api/{account_id}/chats/{chat_id}/typing",
            headers=_headers(),
            timeout=10,
        )
        r.raise_for_status()
        return r.json()


async def get_vault(account_id: str, offset: int = 0, limit: int = 100) -> dict:
    """GET /api/{account}/media/vault — list vault media items."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{OFAPI_BASE_URL}/api/{account_id}/media/vault",
            headers=_headers(),
            params={"offset": offset, "limit": limit},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()


async def download_media(account_id: str, cdn_url: str) -> tuple[bytes, str, str | None]:
    """GET /api/{account}/media/download/{cdnUrl}
    Returns (content_bytes, content_type, redirect_location).
    If the CDN has the file cached the API returns a 302 — we follow the redirect.
    """
    import urllib.parse
    encoded = urllib.parse.quote(cdn_url, safe="")
    async with httpx.AsyncClient(follow_redirects=True) as client:
        r = await client.get(
            f"{OFAPI_BASE_URL}/api/{account_id}/media/download/{encoded}",
            headers=_headers(),
            timeout=30,
        )
        r.raise_for_status()
        content_type = r.headers.get("content-type", "image/jpeg")
        return r.content, content_type, str(r.url) if str(r.url) != f"{OFAPI_BASE_URL}/api/{account_id}/media/download/{encoded}" else None


async def get_vault_lists(account_id: str) -> dict:
    """GET /api/{account}/media/vault/lists — list vault categories."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{OFAPI_BASE_URL}/api/{account_id}/media/vault/lists",
            headers=_headers(),
            timeout=30,
        )
        r.raise_for_status()
        return r.json()


async def get_vault_list(account_id: str, list_id: int, offset: int = 0, limit: int = 100) -> dict:
    """GET /api/{account}/media/vault/lists/{list_id} — paginated media for one vault list."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{OFAPI_BASE_URL}/api/{account_id}/media/vault/lists/{list_id}",
            headers=_headers(),
            params={"offset": offset, "limit": limit},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()


async def send_message_with_media(
    account_id: str,
    chat_id: str,
    content: str,
    price: Optional[float] = None,
    media_ids: Optional[list] = None,
) -> dict:
    """POST /api/{account}/chats/{chat_id}/messages — send message, optionally with vault media."""
    payload: dict = {"text": content}
    if price:
        payload["price"] = price
    if media_ids:
        payload["media"] = [{"id": mid, "type": "photo"} for mid in media_ids]
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{OFAPI_BASE_URL}/api/{account_id}/chats/{chat_id}/messages",
            headers=_headers(),
            json=payload,
            timeout=30,
        )
        r.raise_for_status()
        return r.json()
