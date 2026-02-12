#!/usr/bin/env python3
"""Test script to check DriftClient API methods"""
import asyncio
from driftpy.drift_client import DriftClient
from solders.pubkey import Pubkey
from solana.rpc.async_api import AsyncClient

async def test():
    try:
        connection = AsyncClient('https://api.devnet.solana.com')
        print('Connected to Solana')
        
        user_pubkey = '7Vbmv1jt4vyuqBZcpYPpa74A4yQCQHJvdH7Q7bXJ6QN5'
        
        drift_client = DriftClient(
            connection,
            authority=Pubkey.from_string(user_pubkey),
            env='devnet',
        )
        print('DriftClient created')
        
        # Check available methods
        print('Has get_place_perp_order_tx:', hasattr(drift_client, 'get_place_perp_order_tx'))
        methods = [m for m in dir(drift_client) if 'order' in m.lower() or 'perp' in m.lower()]
        print('Order/Perp methods:', methods)
        
    except Exception as e:
        import traceback
        print(f'Error: {type(e).__name__}: {e}')
        traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(test())
