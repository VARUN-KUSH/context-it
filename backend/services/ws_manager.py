from fastapi import WebSocket
from typing import Dict, Set
import logging

logger = logging.getLogger(__name__)


class WSManager:
    def __init__(self):
        self._connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, ws: WebSocket, user_id: int):
        await ws.accept()
        self._connections.setdefault(user_id, set()).add(ws)
        total = sum(len(s) for s in self._connections.values())
        logger.info("WS connected user=%d  total_connections=%d", user_id, total)

    def disconnect(self, ws: WebSocket, user_id: int):
        if user_id in self._connections:
            self._connections[user_id].discard(ws)

    async def broadcast(self, event: dict):
        """Send event to every connected client."""
        total = sum(len(s) for s in self._connections.values())
        logger.info("WS BROADCAST ▶ type=%r  connections=%d  event=%s", event.get("type"), total, event)
        dead: list[tuple[int, WebSocket]] = []
        for uid, sockets in list(self._connections.items()):
            for ws in list(sockets):
                try:
                    await ws.send_json(event)
                except Exception as e:
                    logger.warning("WS send failed for user %d: %s", uid, e)
                    dead.append((uid, ws))
        for uid, ws in dead:
            self._connections[uid].discard(ws)


manager = WSManager()
