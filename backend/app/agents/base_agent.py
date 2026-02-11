"""
Base Agent class for the multi-agent trading system.
All specialized agents inherit from this base class.
"""

import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from datetime import datetime
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class AgentContext(BaseModel):
    """Context passed to agents containing relevant data."""
    user_message: str
    conversation_id: Optional[int] = None
    wallet_address: Optional[str] = None
    chat_history: List[Dict[str, str]] = []
    prices: Dict[str, float] = {}
    timestamp: str = ""
    
    def __init__(self, **data):
        if "timestamp" not in data or not data["timestamp"]:
            data["timestamp"] = datetime.utcnow().isoformat()
        super().__init__(**data)
    
    class Config:
        arbitrary_types_allowed = True


class AgentResult(BaseModel):
    """Result returned by an agent."""
    agent_name: str
    success: bool
    data: Dict[str, Any] = {}
    error: Optional[str] = None
    execution_time_ms: float = 0
    timestamp: str = ""
    
    def __init__(self, **data):
        if "timestamp" not in data or not data["timestamp"]:
            data["timestamp"] = datetime.utcnow().isoformat()
        super().__init__(**data)
    
    class Config:
        arbitrary_types_allowed = True


class BaseAgent(ABC):
    """
    Base class for all agents in the system.
    
    Each agent is responsible for a specific capability:
    - MarketDataAgent: Fetches prices, stats, indicators
    - SentimentAgent: Searches news, analyzes sentiment
    - AnalysisAgent: Combines data, provides trade insights
    - RuleMonitorAgent: Background monitoring for trading rules
    """
    
    def __init__(self, name: str):
        self.name = name
        self.logger = logging.getLogger(f"agent.{name}")
    
    @abstractmethod
    async def execute(self, context: AgentContext) -> AgentResult:
        """
        Execute the agent's main task.
        
        Args:
            context: AgentContext with user message and relevant data
            
        Returns:
            AgentResult with the agent's output
        """
        pass
    
    @abstractmethod
    def can_handle(self, context: AgentContext) -> float:
        """
        Determine if this agent can handle the given context.
        
        Returns:
            Confidence score 0.0-1.0 indicating how well this agent
            can handle the request. Used by orchestrator for routing.
        """
        pass
    
    async def _execute_with_timing(self, context: AgentContext) -> AgentResult:
        """Execute with timing wrapper."""
        import time
        start = time.time()
        try:
            result = await self.execute(context)
            result.execution_time_ms = (time.time() - start) * 1000
            return result
        except Exception as e:
            self.logger.error(f"Agent {self.name} failed: {e}")
            return AgentResult(
                agent_name=self.name,
                success=False,
                error=str(e),
                execution_time_ms=(time.time() - start) * 1000
            )


class AgentCapability(BaseModel):
    """Describes what an agent can do - used by orchestrator."""
    name: str
    description: str
    triggers: List[str]  # Keywords/patterns that trigger this agent
    priority: int = 5  # 1-10, higher = more important
    can_run_parallel: bool = True  # Can run with other agents
