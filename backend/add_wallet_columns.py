import sqlite3

conn = sqlite3.connect('trading.db')
cursor = conn.cursor()

# Add wallet_address columns if they don't exist
try:
    cursor.execute('ALTER TABLE conversations ADD COLUMN wallet_address TEXT')
    print('Added wallet_address to conversations')
except Exception as e:
    print(f'conversations: {e}')

try:
    cursor.execute('ALTER TABLE trading_rules ADD COLUMN wallet_address TEXT')
    print('Added wallet_address to trading_rules')
except Exception as e:
    print(f'trading_rules: {e}')

try:
    cursor.execute('ALTER TABLE trades ADD COLUMN wallet_address TEXT')
    print('Added wallet_address to trades')
except Exception as e:
    print(f'trades: {e}')

# Add analysis_data column for trading rules
try:
    cursor.execute('ALTER TABLE trading_rules ADD COLUMN analysis_data TEXT')
    print('Added analysis_data to trading_rules')
except Exception as e:
    print(f'analysis_data: {e}')

# Create indexes
try:
    cursor.execute('CREATE INDEX ix_conversations_wallet_address ON conversations(wallet_address)')
    print('Created index on conversations.wallet_address')
except Exception as e:
    print(f'Index conversations: {e}')

try:
    cursor.execute('CREATE INDEX ix_trading_rules_wallet_address ON trading_rules(wallet_address)')
    print('Created index on trading_rules.wallet_address')
except Exception as e:
    print(f'Index trading_rules: {e}')

try:
    cursor.execute('CREATE INDEX ix_trades_wallet_address ON trades(wallet_address)')
    print('Created index on trades.wallet_address')
except Exception as e:
    print(f'Index trades: {e}')

conn.commit()
conn.close()
print('\nDatabase updated successfully!')
