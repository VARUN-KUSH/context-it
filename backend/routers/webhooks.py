from fastapi import APIRouter, Request, BackgroundTasks, Header, HTTPException
from database.database import AsyncSessionLocal
from services.sync_service import ingest_webhook_message
from services.ws_manager import manager as ws_manager
import hmac
import hashlib
import os
import logging
import json
import re

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

WEBHOOK_SECRET = os.getenv("OFAPI_WEBHOOK_SECRET", "")

# OnlyFansAPI.com event type strings
MESSAGE_RECEIVED_EVENTS = {
    "messages.received", "message.received", "message.created",
    "new_message", "chat.message",
}
MESSAGE_SENT_EVENTS = {
    "messages.sent", "message.sent",
}
MESSAGE_DELETED_EVENTS = {
    "messages.deleted", "message.deleted", "chat.message.deleted",
}
TYPING_EVENTS = {
    "users.typing", "user.typing", "chat.typing", "typing", "fan.typing",
}
ONLINE_EVENTS  = {"user.online",  "users.online",  "fan.online",  "chat.online"}
OFFLINE_EVENTS = {"user.offline", "users.offline", "fan.offline", "chat.offline"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _verify_signature(body: bytes, signature: str) -> bool:
    if not WEBHOOK_SECRET:
        return True
    sig = signature.removeprefix("sha256=")
    expected = hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)


def _strip_html(text: str | None) -> str | None:
    """Remove HTML tags and return plain text. Returns None for empty strings."""
    if not text:
        return None
    cleaned = re.sub(r"<[^>]+>", "", text).strip()
    return cleaned or None


def _extract_fan_id(data: dict, event_type: str = "") -> str:
    """
    Resolve the fan's user ID from the message object.

    Received messages → fan is in fromUser.id
    Sent messages     → fan is in toUser.id  (creator sent TO the fan)
    """
    if "sent" in event_type:
        to_id = (data.get("toUser") or {}).get("id")
        if to_id:
            return str(to_id)

    from_id = (data.get("fromUser") or {}).get("id")
    if from_id:
        return str(from_id)

    # Generic fallbacks for other event types (typing, online, etc.)
    # For "users.typing" the entire payload is {"id": <fan_id>} — check bare id
    # last and only when there is no text/content (to avoid using the message id).
    bare_id = data.get("id") if not data.get("text") and not data.get("content") else None
    return str(
        data.get("from_user_id")
        or data.get("fromUserId")
        or data.get("user_id")
        or data.get("userId")
        or (data.get("withUser") or {}).get("id")
        or (data.get("user") or {}).get("id")
        or data.get("fan_id")
        or data.get("fanId")
        or (data.get("toUser") or {}).get("id")
        or bare_id
        or ""
    )


def _build_ws_event(data: dict, fan_id: str, from_creator: bool) -> dict:
    return {
        "type": "message.new",
        "fan_id": fan_id,
        "message": {
            "id": str(data.get("id") or ""),
            "fan_id": fan_id,
            "from_creator": from_creator,
            "content": _strip_html(data.get("text") or data.get("content") or data.get("message")),
            "media_urls": data.get("media") or data.get("mediaFiles") or [],
            "price": data.get("price"),
            "sent_at": data.get("createdAt") or data.get("created_at") or "",
            "is_read": from_creator,
        },
    }


# ── Webhook endpoint ──────────────────────────────────────────────────────────

@router.post("/ofapi")
async def ofapi_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_signature: str = Header(None, alias="X-Signature"),
):
    body = await request.body()

    # Log raw request immediately so nothing is missed
    logger.info("=" * 60)
    logger.info("WEBHOOK RECEIVED from %s", request.client)
    logger.info("Raw body: %s", body.decode("utf-8", errors="replace"))
    logger.info("=" * 60)

    if x_signature and not _verify_signature(body, x_signature):
        logger.warning("Webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        envelope = json.loads(body)
    except Exception as exc:
        logger.error("Webhook body is not valid JSON: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # OnlyFansAPI sends:  { "event": "...", "account_id": "...", "payload": { ... } }
    event_type = (
        envelope.get("event")
        or envelope.get("type")
        or envelope.get("event_type")
        or ""
    ).lower()

    # The actual message/user data lives in "payload", not "data"
    data = envelope.get("payload") or envelope.get("data") or envelope

    fan_id = _extract_fan_id(data, event_type)
    of_account_id = str(envelope.get("account_id") or "")

    logger.info("WEBHOOK PARSED ▶ event_type=%r  fan_id=%s  of_account_id=%s", event_type, fan_id or "(not found)", of_account_id or "(not found)")

    if not fan_id and event_type in (MESSAGE_RECEIVED_EVENTS | MESSAGE_SENT_EVENTS):
        logger.error("Cannot process message event — fan_id missing. data keys: %s", list(data.keys()))

    # ── Route ─────────────────────────────────────────────────────────────────

    if event_type in MESSAGE_RECEIVED_EVENTS:
        background_tasks.add_task(_handle_message, data, fan_id, False, of_account_id)

    elif event_type in MESSAGE_SENT_EVENTS:
        background_tasks.add_task(_handle_message, data, fan_id, True, of_account_id)

    elif event_type in MESSAGE_DELETED_EVENTS:
        msg_id = str(data.get("id") or data.get("messageId") or "")
        if msg_id:
            background_tasks.add_task(
                ws_manager.broadcast,
                {"type": "message.deleted", "message_id": msg_id, "fan_id": fan_id},
            )

    elif event_type in TYPING_EVENTS:
        if fan_id:
            background_tasks.add_task(
                ws_manager.broadcast, {"type": "fan.typing", "fan_id": fan_id}
            )

    elif event_type in ONLINE_EVENTS:
        if fan_id:
            background_tasks.add_task(
                ws_manager.broadcast, {"type": "fan.online", "fan_id": fan_id}
            )

    elif event_type in OFFLINE_EVENTS:
        if fan_id:
            background_tasks.add_task(
                ws_manager.broadcast, {"type": "fan.offline", "fan_id": fan_id}
            )

    else:
        logger.warning("Unhandled event_type=%r", event_type)

    return {"ok": True}


# ── Background tasks ──────────────────────────────────────────────────────────

async def _handle_message(data: dict, fan_id: str, from_creator: bool, of_account_id: str = ""):
    async with AsyncSessionLocal() as db:
        await ingest_webhook_message(data, fan_id, from_creator, db, of_account_id=of_account_id)

    await ws_manager.broadcast(_build_ws_event(data, fan_id, from_creator))

    # Auto-generate fresh AI suggestions whenever the fan sends a message
    if not from_creator and fan_id:
        await _refresh_suggestions(fan_id)


async def _refresh_suggestions(fan_id: str) -> None:
    from services.suggestions_service import build_suggestions_for_fan
    try:
        async with AsyncSessionLocal() as db:
            result = await build_suggestions_for_fan(fan_id, db)
        if result is not None:
            await ws_manager.broadcast({"type": "suggestions.ready", "fan_id": fan_id})
    except Exception as e:
        logger.error("_refresh_suggestions failed for fan %s: %s", fan_id, e)
