from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from enum import Enum


class SuggestionType(str, Enum):
    flirty = "flirty"
    upsell = "upsell"
    reengage = "reengage"


# ── Auth ─────────────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    username: str
    persona: Optional[str] = None
    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str


class PersonaUpdate(BaseModel):
    persona: str


# ── Tags ──────────────────────────────────────────────────────────────────────
class TagCreate(BaseModel):
    name: str
    color: Optional[str] = "#6366f1"


class TagOut(BaseModel):
    id: int
    name: str
    color: str
    model_config = {"from_attributes": True}


# ── OFAccount ─────────────────────────────────────────────────────────────────
class OFAccountCreate(BaseModel):
    of_user_id: str
    username: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None


class OFAccountOut(BaseModel):
    id: int
    of_user_id: str
    username: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: bool
    last_synced_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


# ── Fan ───────────────────────────────────────────────────────────────────────
class FanOut(BaseModel):
    id: str
    account_id: int
    username: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    subscribed_at: Optional[datetime] = None
    total_spent: float
    tip_count: int
    message_count: int
    is_subscribed: bool
    last_message_at: Optional[datetime] = None
    last_message: Optional[str] = None
    last_message_from_creator: Optional[bool] = None
    manual_notes: Optional[str] = None
    ai_summary: Optional[str] = None
    tags: List[TagOut] = []
    model_config = {"from_attributes": True}


class FansResponse(BaseModel):
    fans: List[FanOut]
    has_more: bool
    offset: int


class FanNotesUpdate(BaseModel):
    manual_notes: str


class FanTagsUpdate(BaseModel):
    tag_ids: List[int]


# ── Messages ──────────────────────────────────────────────────────────────────
class MessageOut(BaseModel):
    id: str
    fan_id: str
    from_creator: bool
    content: Optional[str] = None
    media_urls: Optional[list] = None
    price: Optional[float] = None
    sent_at: datetime
    is_read: bool
    model_config = {"from_attributes": True}


class MessagesResponse(BaseModel):
    messages: List[MessageOut]
    has_more: bool
    syncing: bool


class SendMessageRequest(BaseModel):
    content: str
    price: Optional[float] = None


# ── Suggestions ───────────────────────────────────────────────────────────────
class SuggestionOut(BaseModel):
    id: int
    fan_id: str
    suggestion_type: SuggestionType
    content: str
    generated_at: datetime
    model_config = {"from_attributes": True}


class SuggestionsResponse(BaseModel):
    flirty: Optional[SuggestionOut] = None
    upsell: Optional[SuggestionOut] = None
    reengage: Optional[SuggestionOut] = None


class MarkSuccessfulRequest(BaseModel):
    suggestion_id: int
    result_note: Optional[str] = None


# ── Successful Messages ────────────────────────────────────────────────────────
class SuccessfulMessageCreate(BaseModel):
    account_id: int
    suggestion_type: SuggestionType
    content: str
    result_note: Optional[str] = None


class SuccessfulMessageOut(BaseModel):
    id: int
    account_id: int
    suggestion_type: SuggestionType
    content: str
    result_note: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}
