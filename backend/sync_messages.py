"""
One-time (or recurring) script to sync all message history for all fans into the DB.
Run independently of uvicorn:

    cd backend
    source venv/bin/activate
    python sync_messages.py

Safe to re-run — existing messages are skipped. Stops paginating as soon as a page
returns zero new messages, so re-runs are fast once the DB is up to date.
"""
import os
import re
import sys
import time
import logging
import httpx
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras

# Try .env first, fall back to .env.dev
load_dotenv(".env") or load_dotenv(".env.dev")

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

HTML_TAG_RE = re.compile(r"<[^>]+>")


def get_db_conn():
    # When running outside Docker, the service hostname "db" doesn't resolve.
    # Replace it with localhost so the script works from the host machine.
    url = DATABASE_URL.replace("@db:", "@localhost:")
    return psycopg2.connect(url)


def sync_fan_messages(conn, account_of_user_id: str, fan_id: str, fan_name: str):
    """Sync all messages for one fan, newest-first, until we hit a fully-known page."""
    cursor_id = None
    page = 0
    inserted = 0
    LIMIT = 100  # API max

    with httpx.Client(timeout=30) as client:
        while True:
            params = {"limit": LIMIT}
            if cursor_id:
                params["first_id"] = cursor_id

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
            page_new = 0

            with conn.cursor() as cur:
                for m in msgs:
                    msg_id = str(m.get("id") or "")
                    if not msg_id or msg_id == "None":
                        continue

                    cur.execute("SELECT 1 FROM messages WHERE id = %s", (msg_id,))
                    if cur.fetchone():
                        continue

                    sent_at_raw = m.get("createdAt") or m.get("created_at")
                    sent_at = datetime.now(timezone.utc)
                    if sent_at_raw:
                        try:
                            sent_at = datetime.fromisoformat(
                                str(sent_at_raw).replace("Z", "+00:00")
                            )
                        except Exception:
                            pass

                    from_creator = bool(m.get("isSentByMe") or m.get("is_sent_by_me"))
                    raw_text = m.get("text") or m.get("content") or m.get("message")
                    content = HTML_TAG_RE.sub("", raw_text).strip() if raw_text else None
                    media = psycopg2.extras.Json(m.get("media") or [])

                    cur.execute(
                        """
                        INSERT INTO messages
                            (id, fan_id, from_creator, content, media_urls, price, sent_at, is_read)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        (
                            msg_id, fan_id, from_creator, content, media,
                            m.get("price"), sent_at,
                            bool(m.get("isRead") or False),
                        ),
                    )
                    page_new += cur.rowcount

            conn.commit()
            inserted += page_new

            if page % 10 == 0:
                logger.info(f"    Page {page} — {inserted} new messages so far")

            # Full page already in DB → history is caught up, stop paginating
            if page_new == 0:
                logger.info(f"    Page {page} had no new messages — stopping early")
                break

            # Partial page means this was the last page
            if len(msgs) < LIMIT:
                break

            # Cursor param is `first_id` (the oldest message id on current page)
            next_page = (data.get("_pagination") or {}).get("next_page")
            if next_page:
                new_cursor = parse_qs(urlparse(next_page).query).get("first_id", [None])[0]
            else:
                new_cursor = str(msgs[-1].get("id") or "")

            if not new_cursor or new_cursor == cursor_id:
                break
            cursor_id = new_cursor

            time.sleep(0.1)

    logger.info(f"    Done — {page} pages, {inserted} new messages inserted")
    return inserted


def main():
    if not OFAPI_KEY:
        logger.error("OFAPI_KEY is not set. Check your .env file.")
        sys.exit(1)
    if not DATABASE_URL:
        logger.error("DATABASE_URL is not set. Check your .env file.")
        sys.exit(1)

    conn = get_db_conn()
    total_inserted = 0
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, of_user_id, username FROM of_accounts WHERE is_active = TRUE"
            )
            accounts = cur.fetchall()

        logger.info(f"Found {len(accounts)} active account(s)")

        for account in accounts:
            logger.info(f"\nAccount: {account['username']} ({account['of_user_id']})")

            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    "SELECT id, display_name, username FROM fans WHERE account_id = %s",
                    (account["id"],),
                )
                fans = cur.fetchall()

            logger.info(f"  {len(fans)} fan(s) to sync")

            for i, fan in enumerate(fans, 1):
                name = fan["display_name"] or fan["username"] or fan["id"]
                logger.info(f"  [{i}/{len(fans)}] Syncing: {name} ({fan['id']})")
                try:
                    n = sync_fan_messages(conn, account["of_user_id"], fan["id"], name)
                    total_inserted += n
                except Exception as e:
                    logger.error(f"  Failed for {fan['id']}: {e}")

        logger.info(f"\nAll syncs complete. Total new messages inserted: {total_inserted}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
