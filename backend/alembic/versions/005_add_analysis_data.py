"""Add analysis_data column to trading_rules

Revision ID: 005_add_analysis_data
Revises: 004_add_wallet_binding
Create Date: 2026-02-11 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '005_add_analysis_data'
down_revision = '004_add_wallet_binding'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Add analysis_data column to trading_rules table
    op.add_column('trading_rules', sa.Column('analysis_data', sa.JSON(), nullable=True))

def downgrade() -> None:
    # Remove analysis_data from trading_rules
    op.drop_column('trading_rules', 'analysis_data')