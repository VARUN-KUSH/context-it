from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database.database import get_db
from database.models import OFAccount, User
from routers.auth import get_current_user
from services import onlyfans_service as of_api

router = APIRouter(prefix="/vault", tags=["vault"])


async def _get_account(account_id: int, current_user: User, db: AsyncSession) -> OFAccount:
    result = await db.execute(
        select(OFAccount).where(
            OFAccount.id == account_id,
            OFAccount.owner_id == current_user.id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.get("/")
async def list_vault_media(
    account_id: int = Query(...),
    offset: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account(account_id, current_user, db)
    return await of_api.get_vault(account.of_user_id, offset=offset, limit=limit)


@router.get("/lists")
async def list_vault_lists(
    account_id: int = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account(account_id, current_user, db)
    return await of_api.get_vault_lists(account.of_user_id)


@router.get("/media-proxy")
async def proxy_cdn_media(
    url: str = Query(..., description="cdn2.onlyfans.com URL to proxy"),
    account_id: int = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Proxy a cdn2.onlyfans.com thumbnail through the fansapi download endpoint.
    The fansapi endpoint redirects to cdn.fansapi.com when cached, or streams the file.
    We follow the redirect and return the image bytes so the browser can display it.
    """
    account = await _get_account(account_id, current_user, db)
    try:
        content, content_type, _ = await of_api.download_media(account.of_user_id, url)
        return Response(
            content=content,
            media_type=content_type,
            headers={"Cache-Control": "public, max-age=3600"},
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"CDN proxy error: {e}")


@router.get("/lists/{list_id}")
async def get_vault_list(
    list_id: int,
    account_id: int = Query(...),
    offset: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account(account_id, current_user, db)
    return await of_api.get_vault_list(account.of_user_id, list_id, offset=offset, limit=limit)
