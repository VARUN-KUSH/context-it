"""
One-time script to sync all message history for all fans into the local DB.
Run this independently of uvicorn:
    source venv/bin/activate
    python sync_messages.py

It's safe to re-run — existing messages are skipped.
"""
import os
import sys
import time
import logging
import httpx
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras

load_dotenv(".env.dev")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

OFAPI_BASE_URL = os.getenv("OFAPI_BASE_URL", "https://app.onlyfansapi.com")
OFAPI_KEY = os.getenv("OFAPI_KEY", "")
DATABASE_URL = os.getenv("DATABASE_URL", "")

HEADERS = {
    "Authorization": f"Bearer {OFAPI_KEY}",
    "Content-Type": "application/json",
}


def get_db_conn():
    return psycopg2.connect(DATABASE_URL)


def sync_fan_messages(conn, account_of_user_id: str, fan_id: str, fan_name: str):
    last_id = None
    page = 0
    inserted = 0

    with httpx.Client(timeout=30) as client:
        while True:
            params = {"limit": 50}
            if last_id:
                params["last_id"] = last_id

            try:
                r = client.get(
                    f"{OFAPI_BASE_URL}/api/{account_of_user_id}/chats/{fan_id}/messages",
                    headers=HEADERS,
                    params=params,
                )
                r.raise_for_status()
                data = r.json()
            except Exception as e:
                logger.warning(f"    API error on page {page}: {e}")
                break

            msgs = data.get("data", [])
            if not msgs:
                break

            page += 1
            with conn.cursor() as cur:
                for m in msgs:
                    msg_id = str(m.get("id"))

                    # Skip if already stored
                    cur.execute("SELECT 1 FROM messages WHERE id = %s", (msg_id,))
                    if cur.fetchone():
                        continue

                    sent_at_raw = m.get("createdAt") or m.get("created_at")
                    sent_at = datetime.now(timezone.utc)
                    if sent_at_raw:
                        try:
                            sent_at = datetime.fromisoformat(str(sent_at_raw).replace("Z", "+00:00"))
                        except Exception:
                            pass

                    from_creator = bool(m.get("isSentByMe") or m.get("is_sent_by_me"))
                    content = m.get("text") or m.get("content") or m.get("message")
                    media = psycopg2.extras.Json(m.get("media") or [])

                    cur.execute(
                        """
                        INSERT INTO messages (id, fan_id, from_creator, content, media_urls, price, sent_at, is_read)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        (msg_id, fan_id, from_creator, content, media,
                         m.get("price"), sent_at, bool(m.get("isRead") or False))
                    )
                    inserted += cur.rowcount

            conn.commit()

            if page % 10 == 0:
                logger.info(f"    Page {page} — {inserted} new messages so far")

            next_page = data.get("_pagination", {}).get("next_page")
            if not next_page:
                break
            new_last_id = parse_qs(urlparse(next_page).query).get("last_id", [None])[0]
            if not new_last_id or new_last_id == last_id:
                break
            last_id = new_last_id

            time.sleep(0.1)

    logger.info(f"    Done — {page} pages, {inserted} new messages inserted")


def main():
    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, of_user_id, username FROM of_accounts WHERE is_active = TRUE")
            accounts = cur.fetchall()

        logger.info(f"Found {len(accounts)} active accounts")

        for account in accounts:
            logger.info(f"Account: {account['username']} ({account['of_user_id']})")

            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    "SELECT id, display_name, username FROM fans WHERE account_id = %s",
                    (account["id"],)
                )
                fans = cur.fetchall()

            logger.info(f"  {len(fans)} fans")

            for fan in fans:
                name = fan["display_name"] or fan["username"] or fan["id"]
                logger.info(f"  Syncing: {name} ({fan['id']})")
                try:
                    sync_fan_messages(conn, account["of_user_id"], fan["id"], name)
                except Exception as e:
                    logger.error(f"  Failed for {fan['id']}: {e}")

        logger.info("All syncs complete.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
