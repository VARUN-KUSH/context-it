from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from database.database import get_db
from database.models import Fan, Suggestion, OFAccount, User
from schemas.schemas import SuggestionsResponse
from routers.auth import get_current_user
from services.suggestions_service import build_suggestions_for_fan

router = APIRouter(prefix="/suggestions", tags=["suggestions"])


@router.get("/{fan_id}", response_model=SuggestionsResponse)
async def get_suggestions(
    fan_id: str,
    force: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify fan exists and belongs to this user
    fan_result = await db.execute(
        select(Fan).options(selectinload(Fan.tags)).where(Fan.id == fan_id)
    )
    fan = fan_result.scalar_one_or_none()
    if not fan:
        raise HTTPException(status_code=404, detail="Fan not found")

    acc_result = await db.execute(
        select(OFAccount).where(
            OFAccount.id == fan.account_id, OFAccount.owner_id == current_user.id
        )
    )
    if not acc_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not authorized")

    if not force:
        # Return cached suggestions when all 4 types are present and unused
        cached = await db.execute(
            select(Suggestion)
            .where(Suggestion.fan_id == fan_id, Suggestion.used == False)  # noqa: E712
            .order_by(desc(Suggestion.generated_at))
            .limit(4)
        )
        existing = cached.scalars().all()
        existing_by_type = {s.suggestion_type: s for s in existing}
        if len(existing_by_type) >= 3:
            return SuggestionsResponse(
                flirty=existing_by_type.get("flirty"),
                connect=existing_by_type.get("connect"),
                upsell=existing_by_type.get("upsell"),
                reengage=existing_by_type.get("reengage"),
            )

    saved = await build_suggestions_for_fan(fan_id, db)
    if saved is None:
        raise HTTPException(status_code=500, detail="Failed to generate suggestions")

    return SuggestionsResponse(
        flirty=saved.get("flirty"),
        connect=saved.get("connect"),
        upsell=saved.get("upsell"),
        reengage=saved.get("reengage"),
    )
