from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database.database import init_db, AsyncSessionLocal
from database.models import User
from routers import auth, accounts, fans, messages, suggestions, webhooks, vault
from services.ws_manager import manager as ws_manager
from jose import JWTError, jwt
from sqlalchemy import select
import os
import logging

logging.basicConfig(level=logging.INFO)

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret")
ALGORITHM  = "HS256"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="OnlyFans CRM API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Lock this down to your domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(fans.router)
app.include_router(messages.router)
app.include_router(suggestions.router)
app.include_router(webhooks.router)
app.include_router(vault.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str = Query(...)):
    """Authenticated WebSocket — clients pass ?token=<jwt>."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub", 0))
    except (JWTError, ValueError):
        await ws.close(code=4001)
        return

    # Verify user exists
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        if not result.scalar_one_or_none():
            await ws.close(code=4001)
            return

    await ws_manager.connect(ws, user_id)
    try:
        while True:
            await ws.receive_text()   # keep-alive ping from client
    except WebSocketDisconnect:
        ws_manager.disconnect(ws, user_id)
