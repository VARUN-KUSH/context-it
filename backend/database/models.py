from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, Text,
    ForeignKey, Table, Enum, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database.database import Base
import enum


# ── Many-to-many: fan ↔ tag ────────────────────────────────────────────────
fan_tags = Table(
    "fan_tags",
    Base.metadata,
    Column("fan_id", String, ForeignKey("fans.id", ondelete="CASCADE")),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE")),
)


class SuggestionType(str, enum.Enum):
    flirty = "flirty"
    connect = "connect"
    upsell = "upsell"
    reengage = "reengage"


# ── CRM Users (creators + their friends) ───────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Creator persona used for AI context
    persona = Column(Text, nullable=True)

    accounts = relationship("OFAccount", back_populates="owner")


# ── OnlyFans Accounts (up to 30+) ──────────────────────────────────────────
class OFAccount(Base):
    __tablename__ = "of_accounts"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    of_user_id = Column(String, index=True, nullable=False)
    username = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_synced_at = Column(DateTime(timezone=True), nullable=True)

    owner = relationship("User", back_populates="accounts")
    fans = relationship("Fan", back_populates="account")
    successful_messages = relationship("SuccessfulMessage", back_populates="account")


# ── Fans ────────────────────────────────────────────────────────────────────
class Fan(Base):
    __tablename__ = "fans"

    id = Column(String, primary_key=True, index=True)  # OF fan user ID
    account_id = Column(Integer, ForeignKey("of_accounts.id", ondelete="CASCADE"))
    username = Column(String, nullable=True)
    display_name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)

    # Subscription & spend
    subscribed_at = Column(DateTime(timezone=True), nullable=True)
    total_spent = Column(Float, default=0.0)
    tip_count = Column(Integer, default=0)
    message_count = Column(Integer, default=0)
    is_subscribed = Column(Boolean, default=True)
    last_message_at = Column(DateTime(timezone=True), nullable=True)

    # CRM fields
    manual_notes = Column(Text, nullable=True)
    ai_summary = Column(Text, nullable=True)
    ai_summary_updated_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    account = relationship("OFAccount", back_populates="fans")
    messages = relationship("Message", back_populates="fan", order_by="Message.sent_at")
    tags = relationship("Tag", secondary=fan_tags, back_populates="fans")
    suggestions = relationship("Suggestion", back_populates="fan")


# ── Messages ─────────────────────────────────────────────────────────────────
class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, index=True)  # OF message ID
    fan_id = Column(String, ForeignKey("fans.id", ondelete="CASCADE"))
    from_creator = Column(Boolean, default=False)  # True = creator sent it
    content = Column(Text, nullable=True)
    media_urls = Column(JSON, nullable=True)
    price = Column(Float, nullable=True)  # PPV price if any
    sent_at = Column(DateTime(timezone=True), nullable=False)
    is_read = Column(Boolean, default=False)

    fan = relationship("Fan", back_populates="messages")


# ── AI Suggestions ───────────────────────────────────────────────────────────
class Suggestion(Base):
    __tablename__ = "suggestions"

    id = Column(Integer, primary_key=True, index=True)
    fan_id = Column(String, ForeignKey("fans.id", ondelete="CASCADE"))
    suggestion_type = Column(Enum(SuggestionType), nullable=False)
    content = Column(Text, nullable=False)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())
    used = Column(Boolean, default=False)

    fan = relationship("Fan", back_populates="suggestions")


# ── Successful Messages (training examples for AI) ────────────────────────────
class SuccessfulMessage(Base):
    __tablename__ = "successful_messages"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("of_accounts.id", ondelete="CASCADE"))
    suggestion_type = Column(Enum(SuggestionType), nullable=False)
    content = Column(Text, nullable=False)
    result_note = Column(String, nullable=True)  # e.g. "led to $50 tip"
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    account = relationship("OFAccount", back_populates="successful_messages")


# ── Tags ──────────────────────────────────────────────────────────────────────
class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    color = Column(String, default="#6366f1")  # hex color for UI badge

    fans = relationship("Fan", secondary=fan_tags, back_populates="tags")
