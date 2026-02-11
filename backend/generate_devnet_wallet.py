#!/usr/bin/env python3
"""
Generate a new Solana devnet wallet for testing.
Run this script, then:
1. Copy the private key to your .env file as WALLET_PRIVATE_KEY
2. Go to https://faucet.solana.com/ and request devnet SOL for the public key
"""

import base58
from solders.keypair import Keypair

def main():
    # Generate new keypair
    keypair = Keypair()
    
    # Get private key in base58 format (for .env)
    private_key_bytes = bytes(keypair)
    private_key_b58 = base58.b58encode(private_key_bytes).decode('utf-8')
    
    # Get public key (wallet address)
    public_key = str(keypair.pubkey())
    
    print("=" * 60)
    print("NEW DEVNET WALLET GENERATED")
    print("=" * 60)
    print()
    print("PUBLIC KEY (Wallet Address):")
    print(f"  {public_key}")
    print()
    print("PRIVATE KEY (for .env WALLET_PRIVATE_KEY):")
    print(f"  {private_key_b58}")
    print()
    print("=" * 60)
    print("NEXT STEPS:")
    print("=" * 60)
    print()
    print("1. Add to your .env file:")
    print(f"   WALLET_PRIVATE_KEY={private_key_b58}")
    print()
    print("2. Get devnet SOL (choose one):")
    print(f"   a) Visit: https://faucet.solana.com/")
    print(f"      Enter: {public_key}")
    print()
    print(f"   b) Run command:")
    print(f"      solana airdrop 2 {public_key} --url devnet")
    print()
    print("3. Restart the backend server")
    print()
    print("4. Check your balance at:")
    print(f"   https://explorer.solana.com/address/{public_key}?cluster=devnet")
    print()

if __name__ == "__main__":
    main()
