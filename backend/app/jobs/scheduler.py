import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import get_settings
from app.database import async_session_maker
from app.models import TradingRule, JobLog, Trade, RuleStatus, ConditionType, ActionType
from app.services.drift_service import drift_service

logger = logging.getLogger(__name__)
settings = get_settings()


class JobScheduler:
    """Manages cron jobs for monitoring trading conditions."""

    def __init__(self):
        # Use in-memory job store for simplicity (jobs are restored from DB on startup)
        self.scheduler = AsyncIOScheduler(
            job_defaults={
                'coalesce': True,
                'max_instances': 1,
                'misfire_grace_time': 60
            }
        )
        self._running = False

    def start(self):
        """Start the scheduler."""
        if not self._running:
            self.scheduler.start()
            self._running = True
            logger.info("Job scheduler started")

    def stop(self):
        """Stop the scheduler."""
        if self._running:
            self.scheduler.shutdown()
            self._running = False
            logger.info("Job scheduler stopped")

    def add_rule_job(self, rule_id: int):
        """Add a monitoring job for a trading rule."""
        job_id = f"rule_{rule_id}"

        # Remove existing job if any
        if self.scheduler.get_job(job_id):
            self.scheduler.remove_job(job_id)

        # Add new job
        self.scheduler.add_job(
            check_rule_condition,
            trigger=IntervalTrigger(seconds=settings.check_interval_seconds),
            id=job_id,
            args=[rule_id],
            replace_existing=True
        )
        logger.info(f"Added monitoring job for rule {rule_id}")

    def remove_rule_job(self, rule_id: int):
        """Remove a monitoring job."""
        job_id = f"rule_{rule_id}"
        if self.scheduler.get_job(job_id):
            self.scheduler.remove_job(job_id)
            logger.info(f"Removed monitoring job for rule {rule_id}")

    def pause_rule_job(self, rule_id: int):
        """Pause a monitoring job."""
        job_id = f"rule_{rule_id}"
        job = self.scheduler.get_job(job_id)
        if job:
            job.pause()
            logger.info(f"Paused monitoring job for rule {rule_id}")

    def resume_rule_job(self, rule_id: int):
        """Resume a monitoring job."""
        job_id = f"rule_{rule_id}"
        job = self.scheduler.get_job(job_id)
        if job:
            job.resume()
            logger.info(f"Resumed monitoring job for rule {rule_id}")

    def get_job_status(self, rule_id: int) -> Optional[Dict]:
        """Get status of a monitoring job."""
        job_id = f"rule_{rule_id}"
        job = self.scheduler.get_job(job_id)
        if job:
            return {
                "id": job_id,
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
                "pending": job.pending
            }
        return None

    async def restore_jobs(self):
        """Restore jobs from database on startup."""
        async with async_session_maker() as session:
            result = await session.execute(
                select(TradingRule).where(TradingRule.status == RuleStatus.ACTIVE)
            )
            rules = result.scalars().all()

            for rule in rules:
                self.add_rule_job(rule.id)

            logger.info(f"Restored {len(rules)} monitoring jobs")


async def check_rule_condition(rule_id: int):
    """Check if a rule's condition is met and execute trade if so."""
    async with async_session_maker() as session:
        # Get rule
        result = await session.execute(
            select(TradingRule).where(TradingRule.id == rule_id)
        )
        rule = result.scalar_one_or_none()

        if not rule or rule.status != RuleStatus.ACTIVE:
            logger.warning(f"Rule {rule_id} not found or not active")
            return

        try:
            # Get current price
            current_price = await drift_service.get_perp_market_price(rule.market)
            if current_price is None:
                await log_job_result(session, rule_id, None, False, "Could not fetch price")
                return

            # Evaluate condition
            condition_met = evaluate_condition(rule, current_price)

            if condition_met:
                logger.info(f"Condition met for rule {rule_id}! Executing trade...")

                # Execute trade
                tx_sig = await execute_trade(rule)

                # Record trade (inherit wallet_address from rule for filtering)
                trade = Trade(
                    rule_id=rule_id,
                    wallet_address=rule.wallet_address,
                    market=rule.market,
                    side="short" if rule.action_type == ActionType.SELL else "long",
                    size=rule.action_amount_percent,  # Simplified - should calculate actual size
                    price=current_price,
                    tx_signature=tx_sig,
                    status="confirmed" if tx_sig else "failed"
                )
                session.add(trade)

                # Update rule status
                rule.status = RuleStatus.TRIGGERED
                rule.triggered_at = datetime.utcnow()

                await log_job_result(
                    session, rule_id, current_price, True,
                    f"Condition met! Trade executed. TX: {tx_sig}"
                )

                # Remove job since rule is triggered
                job_scheduler.remove_rule_job(rule_id)
            else:
                await log_job_result(
                    session, rule_id, current_price, False,
                    f"Condition not met. Price: ${current_price:.2f}"
                )

            await session.commit()

        except Exception as e:
            logger.error(f"Error checking rule {rule_id}: {e}")
            await log_job_result(session, rule_id, None, False, error=str(e))
            await session.commit()


def evaluate_condition(rule: TradingRule, current_price: float) -> bool:
    """Evaluate if the rule's condition is met."""
    value = rule.condition_value
    ref_price = rule.reference_price or current_price

    if rule.condition_type == ConditionType.PRICE_ABOVE:
        return current_price > value

    elif rule.condition_type == ConditionType.PRICE_BELOW:
        return current_price < value

    elif rule.condition_type == ConditionType.PRICE_CHANGE_PERCENT:
        if ref_price == 0:
            return False
        change_percent = ((current_price - ref_price) / ref_price) * 100
        if value > 0:  # Looking for price increase
            return change_percent >= value
        else:  # Looking for price decrease
            return change_percent <= value

    elif rule.condition_type == ConditionType.PRICE_CHANGE_ABSOLUTE:
        change = current_price - ref_price
        if value > 0:  # Looking for price increase
            return change >= value
        else:  # Looking for price decrease
            return change <= value

    return False


async def execute_trade(rule: TradingRule) -> Optional[str]:
    """Execute the trade action for a rule."""
    try:
        if rule.action_type == ActionType.CLOSE_POSITION:
            return await drift_service.close_position(rule.market)

        elif rule.action_type == ActionType.SELL:
            # Get current position and calculate size
            position = await drift_service.get_user_position(rule.market)
            if position and position["size"] > 0:
                size_to_sell = abs(position["size"]) * (rule.action_amount_percent / 100)
                return await drift_service.place_market_order(
                    rule.market, "short", size_to_sell, reduce_only=True
                )

        elif rule.action_type == ActionType.BUY:
            # For buy, use USD amount or calculate from current position
            if rule.action_amount_usd:
                current_price = await drift_service.get_perp_market_price(rule.market)
                if current_price:
                    size = rule.action_amount_usd / current_price
                    return await drift_service.place_market_order(
                        rule.market, "long", size
                    )

        return None
    except Exception as e:
        logger.error(f"Error executing trade: {e}")
        return None


async def log_job_result(
    session: AsyncSession,
    rule_id: int,
    current_price: Optional[float],
    condition_met: bool,
    message: str = None,
    error: str = None
):
    """Log the result of a job check."""
    log = JobLog(
        rule_id=rule_id,
        current_price=current_price,
        condition_met=condition_met,
        message=message,
        error=error
    )
    session.add(log)


# Singleton instance
job_scheduler = JobScheduler()
