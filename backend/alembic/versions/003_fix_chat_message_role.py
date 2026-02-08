"""Fix chat_messages role column from enum to varchar

Revision ID: 003_fix_chat_message_role
Revises: 002_add_conversations
Create Date: 2024-02-08 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '003_fix_chat_message_role'
down_revision = '002_add_conversations'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Check if the column exists and alter it
    # First drop the enum constraint by changing to varchar
    op.execute("""
        ALTER TABLE chat_messages 
        ALTER COLUMN role TYPE VARCHAR(20) 
        USING role::text
    """)
    
    # Drop the enum type if it exists
    op.execute("""
        DROP TYPE IF EXISTS messagerole CASCADE
    """)

def downgrade() -> None:
    # Create the enum type
    op.execute("""
        CREATE TYPE messagerole AS ENUM ('user', 'assistant', 'system')
    """)
    
    # Change column back to enum
    op.execute("""
        ALTER TABLE chat_messages 
        ALTER COLUMN role TYPE messagerole 
        USING role::messagerole
    """)