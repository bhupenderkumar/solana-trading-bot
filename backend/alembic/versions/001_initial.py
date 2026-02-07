"""Initial migration

Revision ID: 001
Revises:
Create Date: 2024-01-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create trading_rules table
    op.create_table(
        'trading_rules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_input', sa.String(), nullable=False),
        sa.Column('parsed_summary', sa.String(), nullable=True),
        sa.Column('market', sa.String(), nullable=False),
        sa.Column('condition_type', sa.Enum('price_above', 'price_below', 'price_change_percent', 'price_change_absolute', name='conditiontype'), nullable=False),
        sa.Column('condition_value', sa.Float(), nullable=False),
        sa.Column('reference_price', sa.Float(), nullable=True),
        sa.Column('action_type', sa.Enum('buy', 'sell', 'close_position', name='actiontype'), nullable=False),
        sa.Column('action_amount_percent', sa.Float(), nullable=True, default=100.0),
        sa.Column('action_amount_usd', sa.Float(), nullable=True),
        sa.Column('status', sa.Enum('active', 'paused', 'triggered', 'expired', name='rulestatus'), nullable=True, default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('triggered_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_trading_rules_id'), 'trading_rules', ['id'], unique=False)

    # Create job_logs table
    op.create_table(
        'job_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('rule_id', sa.Integer(), nullable=False),
        sa.Column('checked_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('current_price', sa.Float(), nullable=True),
        sa.Column('condition_met', sa.Boolean(), nullable=True, default=False),
        sa.Column('message', sa.String(), nullable=True),
        sa.Column('error', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['rule_id'], ['trading_rules.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_job_logs_id'), 'job_logs', ['id'], unique=False)

    # Create trades table
    op.create_table(
        'trades',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('rule_id', sa.Integer(), nullable=True),
        sa.Column('market', sa.String(), nullable=False),
        sa.Column('side', sa.String(), nullable=False),
        sa.Column('size', sa.Float(), nullable=False),
        sa.Column('price', sa.Float(), nullable=False),
        sa.Column('tx_signature', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('executed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('confirmed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['rule_id'], ['trading_rules.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_trades_id'), 'trades', ['id'], unique=False)

    # Create price_snapshots table
    op.create_table(
        'price_snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('market', sa.String(), nullable=False),
        sa.Column('price', sa.Float(), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_price_snapshots_id'), 'price_snapshots', ['id'], unique=False)
    op.create_index(op.f('ix_price_snapshots_market'), 'price_snapshots', ['market'], unique=False)
    op.create_index(op.f('ix_price_snapshots_timestamp'), 'price_snapshots', ['timestamp'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_price_snapshots_timestamp'), table_name='price_snapshots')
    op.drop_index(op.f('ix_price_snapshots_market'), table_name='price_snapshots')
    op.drop_index(op.f('ix_price_snapshots_id'), table_name='price_snapshots')
    op.drop_table('price_snapshots')
    op.drop_index(op.f('ix_trades_id'), table_name='trades')
    op.drop_table('trades')
    op.drop_index(op.f('ix_job_logs_id'), table_name='job_logs')
    op.drop_table('job_logs')
    op.drop_index(op.f('ix_trading_rules_id'), table_name='trading_rules')
    op.drop_table('trading_rules')

    # Drop enums
    op.execute('DROP TYPE IF EXISTS conditiontype')
    op.execute('DROP TYPE IF EXISTS actiontype')
    op.execute('DROP TYPE IF EXISTS rulestatus')
