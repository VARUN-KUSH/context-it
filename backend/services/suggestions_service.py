"""
Suggestion generation service.
Callable from both HTTP request handlers and background webhook tasks.
No dependency on HTTP auth — looks up persona from the DB directly.
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, desc
from sqlalchemy.orm import selectinload
from database.models import Fan, OFAccount, User, Message, Suggestion, SuccessfulMessage
from services.ai_service import generate_suggestions

logger = logging.getLogger(__name__)

DEFAULT_PERSONA = "A warm, flirty, engaging creator who loves connecting with fans."


async def build_suggestions_for_fan(fan_id: str, db: AsyncSession) -> dict | None:
    """
    Generate fresh AI suggestions for fan_id and persist them.
    Deletes all previous unused suggestions first.
    Returns {suggestion_type: Suggestion} on success, None on failure.
    """
    try:
        fan_result = await db.execute(
            select(Fan).options(selectinload(Fan.tags)).where(Fan.id == fan_id)
        )
        fan = fan_result.scalar_one_or_none()
        if not fan:
            logger.warning("build_suggestions_for_fan: fan %s not found", fan_id)
            return None

        # Resolve persona from account owner
        persona = DEFAULT_PERSONA
        acc_result = await db.execute(
            select(OFAccount).where(OFAccount.id == fan.account_id)
        )
        account = acc_result.scalar_one_or_none()
        account_id = account.id if account else None
        if account:
            user_result = await db.execute(
                select(User).where(User.id == account.owner_id)
            )
            user = user_result.scalar_one_or_none()
            if user and user.persona:
                persona = user.persona

        # Last 100 messages (oldest-first) for conversation context
        msgs_result = await db.execute(
            select(Message)
            .where(Message.fan_id == fan_id)
            .order_by(Message.sent_at.desc())
            .limit(100)
        )
        messages = [
            {"from_creator": m.from_creator, "content": m.content}
            for m in reversed(msgs_result.scalars().all())
        ]

        # Past successful message examples for tone calibration
        examples: list[dict] = []
        if account_id:
            ex_result = await db.execute(
                select(SuccessfulMessage)
                .where(SuccessfulMessage.account_id == account_id)
                .order_by(desc(SuccessfulMessage.created_at))
                .limit(15)
            )
            examples = [
                {"suggestion_type": e.suggestion_type, "content": e.content}
                for e in ex_result.scalars().all()
            ]

        fan_dict = {
            "display_name": fan.display_name,
            "username": fan.username,
            "subscribed_at": str(fan.subscribed_at),
            "total_spent": fan.total_spent,
            "tags": [{"name": t.name} for t in fan.tags],
            "manual_notes": fan.manual_notes,
        }

        new_suggestions = await generate_suggestions(fan_dict, messages, persona, examples)

        # Replace all unused suggestions for this fan
        await db.execute(
            delete(Suggestion).where(Suggestion.fan_id == fan_id, Suggestion.used == False)  # noqa: E712
        )

        saved: dict = {}
        for stype, content in new_suggestions.items():
            if content:
                sug = Suggestion(fan_id=fan_id, suggestion_type=stype, content=content)
                db.add(sug)
                saved[stype] = sug

        await db.commit()
        for sug in saved.values():
            await db.refresh(sug)

        logger.info(
            "build_suggestions_for_fan: saved %d suggestions for fan %s",
            len(saved), fan_id,
        )
        return saved

    except Exception as e:
        logger.error(
            "build_suggestions_for_fan failed for fan %s: %s", fan_id, e, exc_info=True
        )
        try:
            await db.rollback()
        except Exception:
            pass
        return None
