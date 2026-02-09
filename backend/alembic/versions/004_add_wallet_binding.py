"""Add wallet_address to conversations, trading_rules, and trades

Revision ID: 004_add_wallet_binding
Revises: 003_fix_chat_message_role
Create Date: 2026-02-09 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '004_add_wallet_binding'
down_revision = '003_fix_chat_message_role'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add wallet_address to conversations table
    op.add_column('conversations', sa.Column('wallet_address', sa.String(), nullable=True))
    op.create_index('ix_conversations_wallet_address', 'conversations', ['wallet_address'], unique=False)
    
    # Add wallet_address to trading_rules table
    op.add_column('trading_rules', sa.Column('wallet_address', sa.String(), nullable=True))
    op.create_index('ix_trading_rules_wallet_address', 'trading_rules', ['wallet_address'], unique=False)
    
    # Add wallet_address to trades table
    op.add_column('trades', sa.Column('wallet_address', sa.String(), nullable=True))
    op.create_index('ix_trades_wallet_address', 'trades', ['wallet_address'], unique=False)


def downgrade() -> None:
    # Remove wallet_address from trades
    op.drop_index('ix_trades_wallet_address', table_name='trades')
    op.drop_column('trades', 'wallet_address')
    
    # Remove wallet_address from trading_rules
    op.drop_index('ix_trading_rules_wallet_address', table_name='trading_rules')
    op.drop_column('trading_rules', 'wallet_address')
    
    # Remove wallet_address from conversations
    op.drop_index('ix_conversations_wallet_address', table_name='conversations')
    op.drop_column('conversations', 'wallet_address')
