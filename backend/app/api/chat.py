from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, Dict, Any

from app.agents.llm_agent import llm_agent, ChatResponse
from app.services.drift_service import drift_service

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str


class ChatApiResponse(BaseModel):
    intent: str
    response: str
    data: Optional[Dict[str, Any]] = None
    should_create_rule: bool = False
    original_input: Optional[str] = None


@router.post("/", response_model=ChatApiResponse)
async def chat(request: ChatRequest):
    """
    Handle natural language chat messages.
    Supports balance queries, price queries, position queries, help, and general chat.
    If a trading rule is detected, returns should_create_rule=True.
    """
    try:
        # Get current context (prices, balance, positions)
        prices = await drift_service.get_all_perp_prices()

        # Simulate balance for demo (in real mode, would get from Drift)
        balance = {
            "total_usd": 10000.00,
            "available_usd": 10000.00,
            "simulation_mode": True
        }

        # Simulate positions (in real mode, would get from Drift)
        positions = []

        # Build context for the chat agent
        context = {
            "prices": prices,
            "balance": balance,
            "positions": positions
        }

        # Process chat message
        chat_response = await llm_agent.chat(request.message, context)

        # Check if it's a trading rule intent
        should_create_rule = False
        original_input = None
        if chat_response.intent == "trading_rule":
            should_create_rule = True
            original_input = request.message
            if chat_response.data:
                should_create_rule = chat_response.data.get("should_create_rule", False)
                original_input = chat_response.data.get("original_input", request.message)

        return ChatApiResponse(
            intent=chat_response.intent,
            response=chat_response.response,
            data=chat_response.data,
            should_create_rule=should_create_rule,
            original_input=original_input
        )

    except Exception as e:
        return ChatApiResponse(
            intent="error",
            response=f"Sorry, I encountered an error: {str(e)}. Please try again.",
            data=None,
            should_create_rule=False
        )


@router.get("/prices")
async def get_prices():
    """Get current market prices."""
    prices = await drift_service.get_all_perp_prices()
    return {"prices": prices}


@router.get("/balance")
async def get_balance():
    """Get account balance (simulation mode)."""
    return {
        "total_usd": 10000.00,
        "available_usd": 10000.00,
        "simulation_mode": True,
        "currency": "USDC"
    }


@router.get("/positions")
async def get_positions():
    """Get open positions (simulation mode)."""
    return {
        "positions": [],
        "simulation_mode": True
    }
