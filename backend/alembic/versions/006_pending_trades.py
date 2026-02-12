"""Add pending_trades table

Revision ID: 002_pending_trades
Revises: 001_initial
Create Date: 2026-02-11
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '006'
down_revision = '005_add_analysis_data'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'pending_trades',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('rule_id', sa.Integer(), nullable=True),
        sa.Column('wallet_address', sa.String(), nullable=False),
        sa.Column('market', sa.String(), nullable=False),
        sa.Column('side', sa.String(), nullable=False),
        sa.Column('size', sa.Float(), nullable=False),
        sa.Column('price_at_trigger', sa.Float(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('message', sa.String(), nullable=False),
        sa.Column('status', sa.Enum('pending', 'approved', 'executed', 'rejected', 'expired', name='pendingtradestatus'), nullable=True),
        sa.Column('tx_signature', sa.String(), nullable=True),
        sa.Column('executed_price', sa.Float(), nullable=True),
        sa.Column('error', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('acted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['rule_id'], ['trading_rules.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_pending_trades_id'), 'pending_trades', ['id'], unique=False)
    op.create_index(op.f('ix_pending_trades_wallet_address'), 'pending_trades', ['wallet_address'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_pending_trades_wallet_address'), table_name='pending_trades')
    op.drop_index(op.f('ix_pending_trades_id'), table_name='pending_trades')
    op.drop_table('pending_trades')
    op.execute('DROP TYPE IF EXISTS pendingtradestatus')
