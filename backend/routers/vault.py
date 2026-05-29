from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database.database import get_db
from database.models import OFAccount, User
from routers.auth import get_current_user
from services import onlyfans_service as of_api

router = APIRouter(prefix="/vault", tags=["vault"])


@router.get("/")
async def list_vault_media(
    account_id: int = Query(...),
    offset: int = 0,
    limit: int = 40,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OFAccount).where(
            OFAccount.id == account_id,
            OFAccount.owner_id == current_user.id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    data = await of_api.get_vault(account.of_user_id, offset=offset, limit=limit)
    return data
