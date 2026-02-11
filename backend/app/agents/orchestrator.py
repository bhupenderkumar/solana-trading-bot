"""
Orchestrator Agent - Main coordinator that uses LLM to decide which agents to invoke
and how to combine their results into a coherent response.
"""

import json
import logging
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime

from app.agents.base_agent import BaseAgent, AgentContext, AgentResult
from app.agents.market_data_agent import market_data_agent
from app.agents.sentiment_agent import sentiment_agent
from app.agents.portfolio_agent import portfolio_agent
from app.config import get_settings

logger = logging.getLogger(__name__)


# Prompt for orchestrator to decide which agents to use
ORCHESTRATOR_ROUTING_PROMPT = """You are an orchestrator for a crypto trading bot. Analyze the user's request and decide:
1. Which specialized agents to invoke
2. The intent/classification of the request
3. Whether this is a trading rule that should be created

## AVAILABLE AGENTS:

1. **market_data** - Fetches real-time prices, 7-day stats, support/resistance levels, trend analysis
   - Use for: price queries, performance checks, technical data

2. **sentiment** - Searches news, analyzes market sentiment, gathers social signals
   - Use for: news queries, "why" questions, market outlook, sentiment analysis

3. **portfolio** - Checks user's trading rules, executed trades, positions
   - Use for: rule queries, trade history, position checks, "my rules", "my trades"

4. **analysis** - Provides trade suggestions and combines data for comprehensive analysis
   - Use for: trade recommendations, "should I" questions, buy/sell advice

## INTENT CLASSIFICATION:
- **trading_rule**: User wants to CREATE a trading rule/order (e.g., "buy sol at $80", "sell btc when it hits 100k", "alert me if eth drops below 3000")
- **rules_query**: User wants to VIEW their existing rules
- **position_query**: User wants to VIEW their trades/positions
- **price_query**: User just wants to know current price/stats
- **market_analysis**: User wants news/sentiment/analysis without creating a rule
- **general_chat**: General conversation not about trading

## TRADING RULE DETECTION:
A message is a trading rule if the user wants to:
- Set up a buy/sell order at a specific price
- Create a conditional order (when X happens, do Y)
- Set an alert or trigger for a price condition
- Schedule or automate a trade

Examples of trading rules:
- "buy sol at $80" → trading_rule (user wants to buy SOL when price is $80)
- "sell btc at 100k" → trading_rule
- "if eth drops to 3000 buy" → trading_rule
- "alert me when sol goes above 100" → trading_rule

Examples NOT trading rules:
- "what is sol price" → price_query
- "should I buy sol" → market_analysis (asking for advice, not creating a rule)
- "show my rules" → rules_query

## RESPOND WITH JSON:
{
    "agents_to_invoke": ["agent_name1", "agent_name2"],
    "intent": "trading_rule|rules_query|position_query|price_query|market_analysis|general_chat",
    "should_create_rule": true|false,
    "original_input": "exact user input if creating rule, else null",
    "reason": "Brief explanation",
    "parallel": true,
    "priority_agent": "agent_name1",
    "needs_analysis": true
}

IMPORTANT: should_create_rule=true ONLY when user explicitly wants to create/set up a trade order, NOT when asking for advice.
"""


# Prompt for combining agent results
ORCHESTRATOR_COMBINE_PROMPT = """You are a trading assistant combining data from multiple specialized agents to provide a helpful, insightful response.

## YOUR TASK:
Take the data from the agents and create a natural, conversational response that:
1. Answers the user's question directly
2. Provides relevant market data
3. Includes sentiment/news if available
4. Gives actionable trade suggestions when appropriate
5. Mentions it's simulation mode

## RESPONSE GUIDELINES:
- Use markdown formatting for readability
- Include specific numbers (prices, percentages)
- Show trend indicators (📈📉)
- Provide entry/exit levels when suggesting trades
- Include confidence levels for trade suggestions
- Keep it concise but informative

## DATA FROM AGENTS:
{agent_data}

## USER'S QUESTION:
{user_message}

## IMPORTANT:
- Don't make up data - use only what's provided
- If data is missing, acknowledge it
- Always end with a call to action (create rule, etc.)
"""


class OrchestratorAgent(BaseAgent):
    """
    Main orchestrator that coordinates other agents.
    Uses LLM to:
    1. Decide which agents to invoke
    2. Run them in parallel when possible
    3. Combine results into coherent response
    """
    
    def __init__(self):
        super().__init__("orchestrator")
        self.settings = get_settings()
        
        # Register available agents
        self.agents = {
            "market_data": market_data_agent,
            "sentiment": sentiment_agent,
            "portfolio": portfolio_agent,
        }
    
    def can_handle(self, context: AgentContext) -> float:
        """Orchestrator can handle everything."""
        return 1.0
    
    async def execute(self, context: AgentContext) -> AgentResult:
        """
        Main orchestration flow:
        1. Use LLM to decide which agents to invoke
        2. Run selected agents (parallel where possible)
        3. Combine results using LLM
        4. Return final response
        """
        try:
            # Step 1: Decide which agents to invoke
            routing_decision = await self._decide_routing(context)
            logger.info(f"Routing decision: {routing_decision}")
            
            # Step 2: Run selected agents
            agents_to_run = routing_decision.get("agents_to_invoke", ["market_data"])
            run_parallel = routing_decision.get("parallel", True)
            
            agent_results = await self._run_agents(agents_to_run, context, run_parallel)
            
            # Step 3: Combine results
            needs_analysis = routing_decision.get("needs_analysis", True)
            
            if needs_analysis:
                final_response = await self._combine_results_with_llm(
                    context, agent_results, routing_decision
                )
            else:
                final_response = self._combine_results_simple(agent_results)
            
            return AgentResult(
                agent_name=self.name,
                success=True,
                data={
                    "response": final_response,
                    "agents_used": agents_to_run,
                    "routing_decision": routing_decision,
                    "agent_results": {k: v.data for k, v in agent_results.items()}
                }
            )
            
        except Exception as e:
            logger.error(f"Orchestrator error: {e}")
            return AgentResult(
                agent_name=self.name,
                success=False,
                error=str(e)
            )
    
    async def _decide_routing(self, context: AgentContext) -> Dict[str, Any]:
        """Use LLM to decide which agents to invoke."""
        from app.agents.llm_agent import get_openai_client
        
        client, model, http_client = await get_openai_client()
        
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": ORCHESTRATOR_ROUTING_PROMPT},
                    {"role": "user", "content": f"User message: {context.user_message}"}
                ],
                temperature=0.1,
                max_tokens=300
            )
            
            content = response.choices[0].message.content
            
            # Parse JSON from response
            try:
                # Try direct parse
                decision = json.loads(content)
            except json.JSONDecodeError:
                # Try to extract JSON from markdown
                import re
                json_match = re.search(r'```(?:json)?\s*(.*?)\s*```', content, re.DOTALL)
                if json_match:
                    decision = json.loads(json_match.group(1))
                else:
                    # Fallback
                    decision = {
                        "agents_to_invoke": ["market_data"],
                        "reason": "Default routing",
                        "parallel": True,
                        "needs_analysis": True
                    }
            
            return decision
            
        except Exception as e:
            logger.error(f"Routing decision failed: {e}")
            # Fallback to simple routing
            return self._simple_routing(context)
        finally:
            await http_client.aclose()
    
    def _simple_routing(self, context: AgentContext) -> Dict[str, Any]:
        """Fallback simple routing without LLM."""
        message = context.user_message.lower()
        
        agents = []
        
        # Price queries
        if any(kw in message for kw in ["price", "worth", "cost", "how much"]):
            agents.append("market_data")
        
        # Sentiment queries
        if any(kw in message for kw in ["news", "why", "sentiment", "happening", "should"]):
            agents.append("sentiment")
        
        # Portfolio queries
        if any(kw in message for kw in ["rule", "agent", "trade", "position", "executed"]):
            agents.append("portfolio")
        
        # Default to market_data
        if not agents:
            agents = ["market_data"]
        
        return {
            "agents_to_invoke": agents,
            "reason": "Simple keyword routing",
            "parallel": True,
            "needs_analysis": True
        }
    
    async def _run_agents(
        self, 
        agent_names: List[str], 
        context: AgentContext,
        parallel: bool = True
    ) -> Dict[str, AgentResult]:
        """Run selected agents, optionally in parallel."""
        results = {}
        
        # Filter to only available agents
        available_agents = [n for n in agent_names if n in self.agents]
        
        if not available_agents:
            available_agents = ["market_data"]
        
        if parallel and len(available_agents) > 1:
            # Run in parallel
            tasks = []
            for name in available_agents:
                agent = self.agents[name]
                tasks.append(agent._execute_with_timing(context))
            
            agent_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for name, result in zip(available_agents, agent_results):
                if isinstance(result, Exception):
                    results[name] = AgentResult(
                        agent_name=name,
                        success=False,
                        error=str(result)
                    )
                else:
                    results[name] = result
        else:
            # Run sequentially
            for name in available_agents:
                agent = self.agents[name]
                results[name] = await agent._execute_with_timing(context)
        
        return results
    
    async def _combine_results_with_llm(
        self,
        context: AgentContext,
        agent_results: Dict[str, AgentResult],
        routing_decision: Dict
    ) -> str:
        """Use LLM to combine agent results into natural response."""
        from app.agents.llm_agent import get_openai_client
        
        # Build agent data summary
        agent_data_parts = []
        
        for name, result in agent_results.items():
            if result.success:
                agent_data_parts.append(f"## {name.upper()} Agent:\n{json.dumps(result.data, indent=2, default=str)}")
            else:
                agent_data_parts.append(f"## {name.upper()} Agent: FAILED - {result.error}")
        
        agent_data_str = "\n\n".join(agent_data_parts)
        
        prompt = ORCHESTRATOR_COMBINE_PROMPT.format(
            agent_data=agent_data_str,
            user_message=context.user_message
        )
        
        client, model, http_client = await get_openai_client()
        
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=1200
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            logger.error(f"Combine results failed: {e}")
            return self._combine_results_simple(agent_results)
        finally:
            await http_client.aclose()
    
    def _combine_results_simple(self, agent_results: Dict[str, AgentResult]) -> str:
        """Simple combination without LLM."""
        parts = []
        
        for name, result in agent_results.items():
            if result.success:
                data = result.data
                
                if name == "market_data" and "markets" in data:
                    for market, mdata in data["markets"].items():
                        price = mdata.get("current_price", 0)
                        trend = mdata.get("trend", "neutral")
                        change = mdata.get("price_change_7d", 0)
                        
                        emoji = "📈" if trend == "bullish" else "📉" if trend == "bearish" else "➡️"
                        parts.append(f"{emoji} **{market}**: ${price:,.2f} ({change:+.2f}% 7d)")
                
                if name == "sentiment" and "coins" in data:
                    for coin, sdata in data["coins"].items():
                        label = sdata.get("sentiment_label", "neutral")
                        parts.append(f"\n**{coin} Sentiment:** {label}")
                        
                        news = sdata.get("news", [])[:2]
                        if news:
                            parts.append("**Recent News:**")
                            for item in news:
                                parts.append(f"• {item.get('title', '')}")
                
                if name == "portfolio":
                    # Handle rules
                    rules = data.get("rules", [])
                    if rules:
                        parts.append("📋 **Your Trading Rules:**\n")
                        for r in rules[:10]:  # Limit to 10
                            status = r.get("status", "unknown")
                            status_emoji = {"active": "🟢", "paused": "⏸️", "triggered": "✅", "expired": "⏹️"}.get(status, "❓")
                            market = r.get("market", "")
                            summary = r.get("parsed_summary") or r.get("user_input", "")
                            parts.append(f"{status_emoji} **{market}**: {summary}")
                    
                    # Handle trades
                    trades = data.get("trades", [])
                    if trades:
                        parts.append("\n📊 **Recent Trades:**")
                        for t in trades[:5]:  # Limit to 5
                            status = t.get("status", "unknown")
                            status_emoji = "✅" if status == "filled" else "❌" if status == "failed" else "⏳"
                            market = t.get("market", "")
                            side = t.get("side", "")
                            price = t.get("price", 0)
                            parts.append(f"{status_emoji} {side.upper()} {market} @ ${price:,.2f}")
                    
                    # Handle statistics
                    stats = data.get("statistics", {})
                    if stats and not rules:
                        total = stats.get("total_rules", 0)
                        active = stats.get("active_rules", 0)
                        triggered = stats.get("triggered_rules", 0)
                        if total > 0:
                            parts.append(f"📊 **Stats:** {total} rules ({active} active, {triggered} triggered)")
                        else:
                            parts.append("You don't have any trading rules yet.\n\nCreate one by saying: \"Buy SOL when it drops below $80\"")
        
        if not parts:
            return "I couldn't gather the information you requested. Please try again."
        
        return "\n".join(parts)


# Singleton instance
orchestrator_agent = OrchestratorAgent()
