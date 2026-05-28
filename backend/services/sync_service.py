"""
Sync service — pulls fan and message data from onlyfansapi.com
and keeps the local DB up to date.
"""
import asyncio
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from database.models import OFAccount, Fan, Message
from services import onlyfans_service as of_api
import logging

logger = logging.getLogger(__name__)


async def sync_account(account: OFAccount, db: AsyncSession):
    """Full sync for one account: fans + messages."""
    logger.info(f"Starting sync for account {account.username} ({account.of_user_id})")
    try:
        await _sync_fans(account, db)
        await db.execute(
            update(OFAccount)
            .where(OFAccount.id == account.id)
            .values(last_synced_at=datetime.now(timezone.utc))
        )
        await db.commit()
        logger.info(f"Sync complete for {account.username}")
    except Exception as e:
        logger.error(f"Sync failed for {account.username}: {e}")
        await db.rollback()


async def _sync_fans(account: OFAccount, db: AsyncSession):
    """Sync all fans via /api/{acct_id}/fans/all using offset pagination.
    get_fans() returns {"fans": [...], "has_more": bool}.
    We also detect duplicate pages so the loop exits even if the external
    API ignores the offset parameter."""
    offset = 0
    limit = 20
    seen_ids: set = set()

    while True:
        data = await of_api.get_fans(account.of_user_id, offset=offset, limit=limit)
        fans_data: list = data.get("fans") or []
        has_more: bool = bool(data.get("has_more"))

        if not fans_data:
            break

        # Detect repeated pages (API ignoring offset) — stop to avoid infinite loop
        page_ids = {
            str(f.get("id") or f.get("user_id") or f.get("userId") or f.get("fan_id") or "")
            for f in fans_data
        }
        if page_ids & seen_ids:
            logger.info(
                "Duplicate fan IDs detected at offset %d for account %s — stopping sync",
                offset, account.of_user_id,
            )
            break
        seen_ids.update(page_ids)

        for f in fans_data:
            fan_id = str(
                f.get("id")
                or f.get("user_id")
                or f.get("userId")
                or f.get("fan_id")
            )
            if not fan_id or fan_id == "None":
                continue

            result = await db.execute(select(Fan).where(Fan.id == fan_id))
            fan = result.scalar_one_or_none()

            subscribed_at = None
            raw_sub = (
                f.get("subscribed_at")
                or f.get("subscribedAt")
                or f.get("subscribe_at")
            )
            if raw_sub:
                try:
                    subscribed_at = datetime.fromisoformat(
                        str(raw_sub).replace("Z", "+00:00")
                    )
                except Exception:
                    pass

            username = (
                f.get("username")
                or f.get("user", {}).get("username")
                or ""
            )
            display_name = (
                f.get("name")
                or f.get("display_name")
                or f.get("displayName")
                or f.get("user", {}).get("name")
                or username
            )
            avatar_url = (
                f.get("avatar")
                or f.get("avatar_url")
                or f.get("avatarUrl")
                or f.get("user", {}).get("avatar")
            )
            total_spent = float(
                f.get("total_spent")
                or f.get("totalSpent")
                or f.get("spent")
                or 0
            )
            tip_count = int(
                f.get("tips_count")
                or f.get("tipsCount")
                or f.get("tip_count")
                or 0
            )

            if not fan:
                fan = Fan(
                    id=fan_id,
                    account_id=account.id,
                    username=username,
                    display_name=display_name,
                    avatar_url=avatar_url,
                    subscribed_at=subscribed_at,
                    total_spent=total_spent,
                    tip_count=tip_count,
                    is_subscribed=True,
                )
                db.add(fan)
            else:
                fan.username = username or fan.username
                fan.display_name = display_name or fan.display_name
                fan.avatar_url = avatar_url or fan.avatar_url
                fan.total_spent = total_spent
                fan.tip_count = tip_count
                fan.is_subscribed = True

            await db.flush()
            # Messages are loaded lazily when a chat is opened — not during bulk sync

        if not has_more:
            break
        offset += limit
        await asyncio.sleep(1.0)


async def _sync_fan_messages(account: OFAccount, fan_id: str, db: AsyncSession):
    """Sync all messages for one fan using cursor pagination (last_id)."""
    from urllib.parse import urlparse, parse_qs
    last_id = None
    while True:
        try:
            data = await of_api.get_chat_messages(account.of_user_id, fan_id, last_id=last_id)
        except Exception as e:
            logger.warning(f"Could not fetch messages for fan {fan_id}: {e}")
            break

        msgs = data.get("data") if isinstance(data, dict) else data
        if not isinstance(msgs, list):
            msgs = []

        if not msgs:
            break

        for m in msgs:
            msg_id = str(m.get("id"))
            result = await db.execute(select(Message).where(Message.id == msg_id))
            if result.scalar_one_or_none():
                continue

            sent_at_raw = m.get("createdAt") or m.get("created_at") or m.get("sentAt") or m.get("sent_at")
            sent_at = datetime.now(timezone.utc)
            if sent_at_raw:
                try:
                    sent_at = datetime.fromisoformat(str(sent_at_raw).replace("Z", "+00:00"))
                except Exception:
                    pass

            # isSentByMe is the reliable flag — the API sets it to true when the
            # authenticated creator account sent the message.
            from_creator = bool(m.get("isSentByMe") or m.get("is_sent_by_me"))
            content = m.get("text") or m.get("content") or m.get("message")

            db.add(Message(
                id=msg_id,
                fan_id=fan_id,
                from_creator=from_creator,
                content=content,
                media_urls=m.get("media"),
                price=m.get("price"),
                sent_at=sent_at,
                is_read=bool(m.get("isRead") or m.get("is_read") or False),
            ))
            await db.execute(update(Fan).where(Fan.id == fan_id).values(last_message_at=sent_at))

        await db.commit()

        # Follow cursor to next page
        next_page = data.get("_pagination", {}).get("next_page") if isinstance(data, dict) else None
        if not next_page:
            break
        last_id = parse_qs(urlparse(next_page).query).get("last_id", [None])[0]
        if not last_id:
            break
        await asyncio.sleep(0.1)


async def ingest_webhook_message(
    payload: dict,
    fan_id: str,
    from_creator: bool,
    db: AsyncSession,
    of_account_id: str = "",
):
    """Persist a webhook message to the DB.

    `payload`        — the message object (already extracted from the outer envelope)
    `fan_id`         — pre-resolved fan ID string
    `from_creator`   — True when the creator sent this message, False when the fan did
    `of_account_id`  — OnlyFans account ID string (used to upsert unknown fans)
    """
    import re

    try:
        msg_id = str(payload.get("id") or "")
        if not msg_id or msg_id == "None":
            logger.warning("Webhook message missing id — skipping")
            return
        if not fan_id or fan_id == "None":
            logger.warning("Webhook message missing fan_id — skipping")
            return

        # Ensure the fan row exists so the FK constraint is satisfied
        fan_result = await db.execute(select(Fan).where(Fan.id == fan_id))
        fan = fan_result.scalar_one_or_none()
        if not fan:
            # Look up which OFAccount this belongs to
            account_id_int: int | None = None
            if of_account_id:
                acc_result = await db.execute(
                    select(OFAccount).where(OFAccount.of_user_id == of_account_id)
                )
                acct = acc_result.scalar_one_or_none()
                if acct:
                    account_id_int = acct.id

            if account_id_int is None:
                # Fall back to first account in DB
                acc_result = await db.execute(select(OFAccount).limit(1))
                acct = acc_result.scalar_one_or_none()
                if acct:
                    account_id_int = acct.id

            if account_id_int is None:
                logger.error("Cannot create fan — no OFAccount found in DB")
                return

            # Extract fan details from the message payload (fromUser / toUser)
            from_user = payload.get("fromUser") or {}
            to_user = payload.get("toUser") or {}
            fan_data = from_user if not from_creator else to_user
            username = fan_data.get("username") or fan_data.get("name") or ""
            display_name = fan_data.get("name") or fan_data.get("username") or username
            avatar_url = fan_data.get("avatar") or fan_data.get("avatarUrl")

            fan = Fan(
                id=fan_id,
                account_id=account_id_int,
                username=username,
                display_name=display_name,
                avatar_url=avatar_url,
                is_subscribed=True,
                total_spent=0.0,
                tip_count=0,
                message_count=0,
            )
            db.add(fan)
            await db.flush()
            logger.info("Created stub fan record for fan_id=%s", fan_id)

        # Deduplicate
        result = await db.execute(select(Message).where(Message.id == msg_id))
        if result.scalar_one_or_none():
            return

        sent_at_raw = payload.get("createdAt") or payload.get("created_at")
        sent_at = datetime.now(timezone.utc)
        if sent_at_raw:
            try:
                sent_at = datetime.fromisoformat(str(sent_at_raw).replace("Z", "+00:00"))
            except Exception:
                pass

        raw_text = payload.get("text") or payload.get("content") or payload.get("message")
        content = re.sub(r"<[^>]+>", "", raw_text).strip() if raw_text else None

        msg = Message(
            id=msg_id,
            fan_id=fan_id,
            from_creator=from_creator,
            content=content,
            media_urls=payload.get("media"),
            price=payload.get("price"),
            sent_at=sent_at,
            is_read=False,
        )
        db.add(msg)
        await db.execute(
            update(Fan).where(Fan.id == fan_id).values(last_message_at=sent_at)
        )
        await db.commit()
        logger.info("Webhook message saved: msg_id=%s fan_id=%s from_creator=%s", msg_id, fan_id, from_creator)
    except Exception as e:
        logger.error(f"Webhook ingest error: {e}", exc_info=True)
        await db.rollback()
