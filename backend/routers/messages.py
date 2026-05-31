from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, or_, and_
from database.database import get_db
from database.models import Fan, Message, OFAccount, User
from schemas.schemas import MessageOut, MessagesResponse, SendMessageRequest
from routers.auth import get_current_user
from services import onlyfans_service as of_api
from services.sync_service import sync_fan_messages
from datetime import datetime, timezone
from typing import Optional
import uuid

router = APIRouter(prefix="/messages", tags=["messages"])


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
    background_tasks: BackgroundTasks,
    before_id: Optional[str] = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account_for_fan(fan_id, db)

    stmt = (
        select(Message)
        .where(Message.fan_id == fan_id)
        .order_by(Message.sent_at.desc(), Message.id.desc())
        .limit(limit + 1)
    )

    if before_id:
        ref_result = await db.execute(
            select(Message.sent_at, Message.id).where(Message.id == before_id)
        )
        ref_row = ref_result.one_or_none()
        if ref_row:
            ref_sent_at, ref_id = ref_row
            # Use (sent_at, id) tuple comparison to handle same-timestamp messages
            # without missing any at the page boundary
            stmt = stmt.where(
                or_(
                    Message.sent_at < ref_sent_at,
                    and_(Message.sent_at == ref_sent_at, Message.id < ref_id),
                )
            )
        else:
            # Cursor not found — caller has a stale before_id; return nothing
            return MessagesResponse(messages=[], has_more=False, syncing=False)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    # Return oldest-first for display
    messages = list(reversed(rows))

    # No messages and not paginating → trigger a background sync then return
    if not messages and not before_id:
        background_tasks.add_task(sync_fan_messages, account, fan_id, db)
        return MessagesResponse(messages=[], has_more=False, syncing=True)

    return MessagesResponse(messages=messages, has_more=has_more, syncing=False)


@router.post("/{fan_id}/sync")
async def trigger_fan_message_sync(
    fan_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually kick off a message sync for a single fan's chat."""
    account = await _get_account_for_fan(fan_id, db)
    background_tasks.add_task(sync_fan_messages, account, fan_id, db)
    return {"message": "Message sync started"}


@router.post("/{fan_id}/refresh-media")
async def refresh_media_urls(
    fan_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch fresh signed media URLs from the OnlyFans API for recent messages and update DB.
    Returns a list of {id, media_urls} for patching the frontend in-place."""
    from urllib.parse import urlparse, parse_qs

    account = await _get_account_for_fan(fan_id, db)
    fresh_media: dict[str, list] = {}
    cursor_id = None

    for _ in range(5):  # up to 500 most-recent messages
        try:
            data = await of_api.get_chat_messages(account.of_user_id, fan_id, cursor_id=cursor_id)
        except Exception:
            break
        msgs = data.get("data") if isinstance(data, dict) else data
        if not isinstance(msgs, list) or not msgs:
            break
        for m in msgs:
            msg_id = str(m.get("id") or "")
            media = m.get("media")
            if msg_id and media:
                fresh_media[msg_id] = media
        if len(msgs) < 100:
            break
        next_page = (data.get("_pagination") or {}).get("next_page") if isinstance(data, dict) else None
        if next_page:
            cursor_id = parse_qs(urlparse(next_page).query).get("first_id", [None])[0]
        else:
            cursor_id = str(msgs[-1].get("id") or "")
        if not cursor_id:
            break

    updated = []
    for msg_id, media in fresh_media.items():
        result = await db.execute(select(Message).where(Message.id == msg_id))
        msg = result.scalar_one_or_none()
        if msg and media:
            msg.media_urls = media
            updated.append({"id": msg_id, "media_urls": media})

    if updated:
        await db.commit()

    return {"updated": updated}


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
        pass
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

    response = await of_api.send_message_with_media(
        account.of_user_id, fan_id, body.content, body.price, body.media_ids
    )

    now = datetime.now(timezone.utc)
    msg_id = str(response.get("id") or uuid.uuid4())

    # Persist immediately; webhook arriving later will be deduped by id
    existing = await db.execute(select(Message).where(Message.id == msg_id))
    if not existing.scalar_one_or_none():
        db.add(Message(
            id=msg_id,
            fan_id=fan_id,
            from_creator=True,
            content=body.content,
            price=body.price,
            sent_at=now,
            is_read=True,
            media_urls=[],
        ))
        await db.execute(update(Fan).where(Fan.id == fan_id).values(last_message_at=now))
        await db.commit()

    return MessageOut(
        id=msg_id,
        fan_id=fan_id,
        from_creator=True,
        content=body.content,
        price=body.price,
        sent_at=now,
        is_read=True,
        media_urls=[],
    )
