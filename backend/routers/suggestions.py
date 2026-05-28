from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, delete
from sqlalchemy.orm import selectinload
from database.database import get_db
from database.models import Fan, Suggestion, OFAccount, SuccessfulMessage, User, Message
from schemas.schemas import SuggestionsResponse, SuggestionOut
from routers.auth import get_current_user
from services.ai_service import generate_suggestions
from typing import Optional

router = APIRouter(prefix="/suggestions", tags=["suggestions"])


async def _build_suggestions(
    fan_id: str, current_user: User, db: AsyncSession, force: bool = False
) -> dict:
    # Load fan with tags
    fan_result = await db.execute(
        select(Fan).options(selectinload(Fan.tags)).where(Fan.id == fan_id)
    )
    fan = fan_result.scalar_one_or_none()
    if not fan:
        raise HTTPException(status_code=404, detail="Fan not found")

    # Verify account ownership
    acc_result = await db.execute(
        select(OFAccount).where(
            OFAccount.id == fan.account_id, OFAccount.owner_id == current_user.id
        )
    )
    account = acc_result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=403, detail="Not authorized")

    if not force:
        # Return cached suggestions if fresh
        cached = await db.execute(
            select(Suggestion)
            .where(Suggestion.fan_id == fan_id, Suggestion.used == False)
            .order_by(desc(Suggestion.generated_at))
            .limit(3)
        )
        existing = cached.scalars().all()
        if len(existing) == 3:
            return {s.suggestion_type: s for s in existing}

    # Fetch messages for context
    msgs_result = await db.execute(
        select(Message)
        .where(Message.fan_id == fan_id)
        .order_by(Message.sent_at)
        .limit(30)
    )
    messages = [
        {"from_creator": m.from_creator, "content": m.content}
        for m in msgs_result.scalars().all()
    ]

    # Fetch successful message examples
    examples_result = await db.execute(
        select(SuccessfulMessage)
        .where(SuccessfulMessage.account_id == fan.account_id)
        .order_by(desc(SuccessfulMessage.created_at))
        .limit(15)
    )
    examples = [
        {"suggestion_type": e.suggestion_type, "content": e.content}
        for e in examples_result.scalars().all()
    ]

    fan_dict = {
        "display_name": fan.display_name,
        "username": fan.username,
        "subscribed_at": str(fan.subscribed_at),
        "total_spent": fan.total_spent,
        "tags": [{"name": t.name} for t in fan.tags],
        "manual_notes": fan.manual_notes,
    }

    persona = current_user.persona or "A warm, flirty, engaging creator who loves connecting with fans."

    # Generate new suggestions
    new_suggestions = await generate_suggestions(fan_dict, messages, persona, examples)

    # Clear old unused suggestions for this fan
    await db.execute(
        delete(Suggestion).where(Suggestion.fan_id == fan_id, Suggestion.used == False)
    )

    # Store new ones
    saved = {}
    for stype, content in new_suggestions.items():
        if content:
            sug = Suggestion(fan_id=fan_id, suggestion_type=stype, content=content)
            db.add(sug)
            saved[stype] = sug

    await db.commit()
    for sug in saved.values():
        await db.refresh(sug)

    return saved


@router.get("/{fan_id}", response_model=SuggestionsResponse)
async def get_suggestions(
    fan_id: str,
    force: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    suggestions = await _build_suggestions(fan_id, current_user, db, force=force)
    return SuggestionsResponse(
        flirty=suggestions.get("flirty"),
        upsell=suggestions.get("upsell"),
        reengage=suggestions.get("reengage"),
    )
