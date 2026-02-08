from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON, Enum, ForeignKey, Float, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class RuleStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    TRIGGERED = "triggered"
    EXPIRED = "expired"


class ConditionType(str, enum.Enum):
    PRICE_ABOVE = "price_above"
    PRICE_BELOW = "price_below"
    PRICE_CHANGE_PERCENT = "price_change_percent"
    PRICE_CHANGE_ABSOLUTE = "price_change_absolute"


class ActionType(str, enum.Enum):
    BUY = "buy"
    SELL = "sell"
    CLOSE_POSITION = "close_position"


class MessageRole(str, enum.Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class Conversation(Base):
    """Represents a chat conversation/session."""
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, default="New Chat")
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    messages = relationship("ChatMessage", back_populates="conversation", order_by="ChatMessage.created_at")
    rules = relationship("TradingRule", back_populates="conversation")


class ChatMessage(Base):
    """Represents a single message in a conversation."""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    
    role = Column(Enum(MessageRole, values_callable=lambda x: [e.value for e in x]), nullable=False)
    content = Column(Text, nullable=False)
    
    # Optional metadata
    intent = Column(String)  # Detected intent for assistant messages
    data = Column(JSON)  # Additional data (prices, rule info, etc.)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    conversation = relationship("Conversation", back_populates="messages")


class TradingRule(Base):
    __tablename__ = "trading_rules"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=True)  # Link to conversation
    
    user_input = Column(String, nullable=False)  # Original natural language input
    parsed_summary = Column(String)  # Human-readable summary of parsed rule

    # Parsed condition
    market = Column(String, nullable=False)  # e.g., "SOL-PERP"
    condition_type = Column(Enum(ConditionType, values_callable=lambda x: [e.value for e in x]), nullable=False)
    condition_value = Column(Float, nullable=False)  # e.g., 100.0 for price, 0.05 for 5%
    reference_price = Column(Float)  # Price at time of rule creation (for relative conditions)

    # Parsed action
    action_type = Column(Enum(ActionType, values_callable=lambda x: [e.value for e in x]), nullable=False)
    action_amount_percent = Column(Float, default=100.0)  # Percentage of position
    action_amount_usd = Column(Float)  # Or fixed USD amount

    # Status
    status = Column(Enum(RuleStatus, values_callable=lambda x: [e.value for e in x]), default=RuleStatus.ACTIVE)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    triggered_at = Column(DateTime(timezone=True))

    # Relationships
    conversation = relationship("Conversation", back_populates="rules")
    job_logs = relationship("JobLog", back_populates="rule")
    trades = relationship("Trade", back_populates="rule")


class JobLog(Base):
    __tablename__ = "job_logs"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(Integer, ForeignKey("trading_rules.id"), nullable=False)

    # Log details
    checked_at = Column(DateTime(timezone=True), server_default=func.now())
    current_price = Column(Float)
    condition_met = Column(Boolean, default=False)
    message = Column(String)
    error = Column(String)

    # Relationship
    rule = relationship("TradingRule", back_populates="job_logs")


class Trade(Base):
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(Integer, ForeignKey("trading_rules.id"))

    # Trade details
    market = Column(String, nullable=False)
    side = Column(String, nullable=False)  # "long" or "short"
    size = Column(Float, nullable=False)
    price = Column(Float, nullable=False)

    # Transaction
    tx_signature = Column(String)
    status = Column(String)  # "pending", "confirmed", "failed"

    # Timestamps
    executed_at = Column(DateTime(timezone=True), server_default=func.now())
    confirmed_at = Column(DateTime(timezone=True))

    # Relationship
    rule = relationship("TradingRule", back_populates="trades")


class PriceSnapshot(Base):
    __tablename__ = "price_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    market = Column(String, nullable=False, index=True)
    price = Column(Float, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)