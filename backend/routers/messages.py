from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database.database import get_db
from database.models import Fan, OFAccount, User
from schemas.schemas import MessageOut, MessagesResponse, SendMessageRequest
from routers.auth import get_current_user
from services import onlyfans_service as of_api
from datetime import datetime, timezone
from typing import Optional
import uuid

router = APIRouter(prefix="/messages", tags=["messages"])


def _parse_message(m: dict, fan_id: str) -> MessageOut:
    sent_at = datetime.now(timezone.utc)
    raw_time = m.get("createdAt") or m.get("created_at")
    if raw_time:
        try:
            sent_at = datetime.fromisoformat(str(raw_time).replace("Z", "+00:00"))
        except Exception:
            pass
    return MessageOut(
        id=str(m.get("id")),
        fan_id=fan_id,
        from_creator=bool(m.get("isSentByMe")),
        content=m.get("text") or m.get("content"),
        media_urls=m.get("media") or [],
        price=m.get("price"),
        sent_at=sent_at,
        is_read=bool(m.get("isRead") or False),
    )


async def _get_account_for_fan(fan_id: str, db: AsyncSession):
    fan_result = await db.execute(select(Fan).where(Fan.id == fan_id))
    fan = fan_result.scalar_one_or_none()
    if not fan:
        raise HTTPException(status_code=404, detail="Fan not found")
    acc_result = await db.execute(select(OFAccount).where(OFAccount.id == fan.account_id))
    account = acc_result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.get("/{fan_id}", response_model=MessagesResponse)
async def get_messages(
    fan_id: str,
    before_id: Optional[str] = None,  # scroll up: oldest msg id currently shown
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account_for_fan(fan_id, db)

    # Fetch live from API — `before_id` maps to `id` param (desc order cursor)
    data = await of_api.get_chat_messages(
        account.of_user_id, fan_id, cursor_id=before_id, limit=limit
    )

    raw = data.get("data", []) if isinstance(data, dict) else []
    has_more = bool((data.get("_pagination") or {}).get("next_page"))

    # API returns newest-first; reverse so display is oldest-first
    messages = list(reversed([_parse_message(m, fan_id) for m in raw]))

    return MessagesResponse(messages=messages, has_more=has_more, syncing=False)


@router.post("/{fan_id}/typing")
async def send_typing(
    fan_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account_for_fan(fan_id, db)
    try:
        await of_api.send_typing_indicator(account.of_user_id, fan_id)
    except Exception:
        pass  # best-effort, don't fail the request
    return {"ok": True}


@router.post("/{fan_id}/send", response_model=MessageOut)
async def send_message(
    fan_id: str,
    body: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fan_result = await db.execute(select(Fan).where(Fan.id == fan_id))
    fan = fan_result.scalar_one_or_none()
    if not fan:
        raise HTTPException(status_code=404, detail="Fan not found")

    acc_result = await db.execute(
        select(OFAccount).where(
            OFAccount.id == fan.account_id, OFAccount.owner_id == current_user.id
        )
    )
    account = acc_result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=403, detail="Not authorized")

    response = await of_api.send_message(
        account.of_user_id, fan_id, body.content, body.price
    )

    now = datetime.now(timezone.utc)
    return MessageOut(
        id=str(response.get("id") or uuid.uuid4()),
        fan_id=fan_id,
        from_creator=True,
        content=body.content,
        price=body.price,
        sent_at=now,
        is_read=True,
        media_urls=[],
    )
