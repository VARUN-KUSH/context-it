from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from database.database import get_db
from database.models import Fan, OFAccount, Tag, User, Suggestion, SuccessfulMessage, Message
from schemas.schemas import (
    FanOut, FansResponse, FanNotesUpdate, FanTagsUpdate, TagCreate, TagOut,
    SuggestionsResponse, SuggestionOut, MarkSuccessfulRequest, SuccessfulMessageOut
)
from routers.auth import get_current_user
from services.ai_service import generate_fan_summary, generate_suggestions
from services import onlyfans_service as of_api
from datetime import datetime, timezone
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/fans", tags=["fans"])


async def _get_fan_or_404(fan_id: str, db: AsyncSession) -> Fan:
    result = await db.execute(
        select(Fan).options(selectinload(Fan.tags)).where(Fan.id == fan_id)
    )
    fan = result.scalar_one_or_none()
    if not fan:
        raise HTTPException(status_code=404, detail="Fan not found")
    return fan


@router.get("/", response_model=FansResponse)
async def list_fans(
    account_id: int = Query(...),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    acc_result = await db.execute(
        select(OFAccount).where(
            OFAccount.id == account_id, OFAccount.owner_id == current_user.id
        )
    )
    account = acc_result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=403, detail="Account not found")

    # Serve fans from the local DB (populated by sync).
    # SQL offset/limit gives us correct infinite-scroll pagination.
    query = (
        select(Fan)
        .options(selectinload(Fan.tags))
        .where(Fan.account_id == account_id)
    )

    if search:
        pattern = f"%{search}%"
        query = query.where(
            Fan.display_name.ilike(pattern) | Fan.username.ilike(pattern)
        )

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar() or 0

    query = (
        query
        .order_by(Fan.subscribed_at.desc().nullslast(), Fan.id)
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(query)
    fans_db = result.scalars().all()

    has_more = (offset + len(fans_db)) < total

    # Batch-fetch last message for each fan in one query
    last_msgs: dict[str, Message] = {}
    if fans_db:
        fan_ids = [f.id for f in fans_db]
        latest_sub = (
            select(Message.fan_id, func.max(Message.sent_at).label("max_sent"))
            .where(Message.fan_id.in_(fan_ids))
            .group_by(Message.fan_id)
            .subquery()
        )
        msgs_result = await db.execute(
            select(Message).join(
                latest_sub,
                (Message.fan_id == latest_sub.c.fan_id)
                & (Message.sent_at == latest_sub.c.max_sent),
            )
        )
        last_msgs = {m.fan_id: m for m in msgs_result.scalars().all()}

    fans_out = [
        FanOut(
            id=fan.id,
            account_id=fan.account_id,
            username=fan.username or "",
            display_name=fan.display_name or fan.username or "",
            avatar_url=fan.avatar_url,
            subscribed_at=fan.subscribed_at,
            total_spent=fan.total_spent or 0.0,
            tip_count=fan.tip_count or 0,
            message_count=fan.message_count or 0,
            is_subscribed=fan.is_subscribed,
            last_message_at=fan.last_message_at,
            last_message=last_msgs[fan.id].content if fan.id in last_msgs else None,
            last_message_from_creator=last_msgs[fan.id].from_creator if fan.id in last_msgs else None,
            manual_notes=fan.manual_notes,
            ai_summary=fan.ai_summary,
            tags=fan.tags or [],
        )
        for fan in fans_db
    ]

    return FansResponse(fans=fans_out, has_more=has_more, offset=offset)


@router.get("/chats")
async def list_fan_chats(
    account_id: int = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns last-message data for all chats, keyed by fan_id."""
    acc_result = await db.execute(
        select(OFAccount).where(
            OFAccount.id == account_id, OFAccount.owner_id == current_user.id
        )
    )
    account = acc_result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=403, detail="Account not found")

    raw = await of_api.get_chats(account.of_user_id)
    chats = raw.get("data", []) if isinstance(raw, dict) else []
    if isinstance(chats, dict):
        chats = chats.get("list", [])

    result = []
    for chat in (chats or []):
        with_user = chat.get("withUser") or chat.get("with_user") or {}
        last_msg = chat.get("lastMessage") or chat.get("last_message") or {}
        fan_id = str(with_user.get("id") or chat.get("chat_id") or "")
        if not fan_id or fan_id == "None":
            continue
        result.append({
            "fan_id": fan_id,
            "last_message": last_msg.get("text") or last_msg.get("content"),
            "last_message_at": last_msg.get("createdAt") or last_msg.get("created_at"),
            "is_sent_by_me": bool(last_msg.get("isSentByMe") or last_msg.get("is_sent_by_me")),
            "is_read": bool(last_msg.get("isRead") or last_msg.get("is_read") or last_msg.get("isSentByMe")),
        })
    return result


@router.get("/{fan_id}", response_model=FanOut)
async def get_fan(
    fan_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_fan_or_404(fan_id, db)


@router.patch("/{fan_id}/notes", response_model=FanOut)
async def update_notes(
    fan_id: str,
    body: FanNotesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fan = await _get_fan_or_404(fan_id, db)
    fan.manual_notes = body.manual_notes
    await db.commit()
    await db.refresh(fan)
    return fan


@router.patch("/{fan_id}/tags", response_model=FanOut)
async def update_tags(
    fan_id: str,
    body: FanTagsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fan = await _get_fan_or_404(fan_id, db)
    tags_result = await db.execute(select(Tag).where(Tag.id.in_(body.tag_ids)))
    fan.tags = tags_result.scalars().all()
    await db.commit()
    await db.refresh(fan)
    return fan


@router.post("/{fan_id}/summarize")
async def summarize_fan(
    fan_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fan = await _get_fan_or_404(fan_id, db)
    msgs_result = await db.execute(
        select(Fan).options(selectinload(Fan.messages)).where(Fan.id == fan_id)
    )
    fan_with_msgs = msgs_result.scalar_one()
    fan_dict = {
        "display_name": fan.display_name,
        "username": fan.username,
        "subscribed_at": str(fan.subscribed_at),
        "total_spent": fan.total_spent,
        "tags": [{"name": t.name} for t in fan.tags],
        "manual_notes": fan.manual_notes,
    }
    msgs = [
        {"from_creator": m.from_creator, "content": m.content}
        for m in fan_with_msgs.messages
    ]
    summary = await generate_fan_summary(fan_dict, msgs)
    fan.ai_summary = summary
    fan.ai_summary_updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"summary": summary}


# ── Tags ──────────────────────────────────────────────────────────────────────

@router.get("/tags/all", response_model=List[TagOut])
async def list_tags(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tag))
    return result.scalars().all()


@router.post("/tags/", response_model=TagOut)
async def create_tag(
    body: TagCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tag = Tag(name=body.name, color=body.color or "#6366f1")
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


# ── Successful messages ────────────────────────────────────────────────────────

@router.post("/successful-messages/mark", response_model=SuccessfulMessageOut)
async def mark_successful(
    body: MarkSuccessfulRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sug_result = await db.execute(
        select(Suggestion).where(Suggestion.id == body.suggestion_id)
    )
    sug = sug_result.scalar_one_or_none()
    if not sug:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    fan = await _get_fan_or_404(sug.fan_id, db)
    sug.used = True

    saved = SuccessfulMessage(
        account_id=fan.account_id,
        suggestion_type=sug.suggestion_type,
        content=sug.content,
        result_note=body.result_note,
    )
    db.add(saved)
    await db.commit()
    await db.refresh(saved)
    return saved
