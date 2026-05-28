from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database.database import get_db
from database.models import OFAccount, User
from schemas.schemas import OFAccountCreate, OFAccountOut
from routers.auth import get_current_user
from services.sync_service import sync_account
from services import onlyfans_service as of_api
from typing import List

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("/", response_model=List[OFAccountOut])
async def list_accounts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OFAccount).where(OFAccount.owner_id == current_user.id)
    )
    return result.scalars().all()


@router.post("/connected")
async def list_connected_of_accounts():
    """Fetch all accounts connected to onlyfansapi.com — use this to get acct_ IDs."""
    accounts = await of_api.list_connected_accounts()
    return accounts


@router.post("/", response_model=OFAccountOut)
async def add_account(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Auto-fetches connected accounts from onlyfansapi.com and adds them all.
    No manual ID entry needed.
    """
    connected = await of_api.list_connected_accounts()
    if not connected:
        raise HTTPException(
            status_code=404,
            detail="No accounts found on onlyfansapi.com. Please connect your OF account there first."
        )

    added = []
    for acc_data in connected:
        acct_id = acc_data.get("id") or acc_data.get("acct_id") or acc_data.get("account_id")
        username = acc_data.get("username") or acc_data.get("onlyfans_username") or ""
        display_name = acc_data.get("name") or acc_data.get("display_name") or username
        avatar_url = acc_data.get("avatar") or acc_data.get("avatar_url")

        if not acct_id:
            continue

        # Skip if already added
        existing = await db.execute(
            select(OFAccount).where(
                OFAccount.of_user_id == str(acct_id),
                OFAccount.owner_id == current_user.id,
            )
        )
        if existing.scalar_one_or_none():
            continue

        account = OFAccount(
            owner_id=current_user.id,
            of_user_id=str(acct_id),
            username=username,
            display_name=display_name,
            avatar_url=avatar_url,
        )
        db.add(account)
        await db.flush()
        added.append(account)
        background_tasks.add_task(sync_account, account, db)

    await db.commit()
    for a in added:
        await db.refresh(a)

    if not added:
        raise HTTPException(status_code=409, detail="All connected accounts are already added.")

    return added[0]


@router.post("/sync-all")
async def sync_all_accounts(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OFAccount).where(OFAccount.owner_id == current_user.id)
    )
    accounts = result.scalars().all()
    for account in accounts:
        background_tasks.add_task(sync_account, account, db)
    return {"message": f"Syncing {len(accounts)} accounts"}


@router.post("/{account_id}/sync")
async def trigger_sync(
    account_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OFAccount).where(
            OFAccount.id == account_id, OFAccount.owner_id == current_user.id
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    background_tasks.add_task(sync_account, account, db)
    return {"message": "Sync started"}


@router.delete("/{account_id}")
async def remove_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OFAccount).where(
            OFAccount.id == account_id, OFAccount.owner_id == current_user.id
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    await db.delete(account)
    await db.commit()
    return {"message": "Account removed"}
