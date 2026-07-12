# Manual Two-Device Encrypted Message Test

Use independent browser profiles or physical devices. Never record private keys, viewing scalars, channel secrets, recovery phrases, authenticated RPC URLs, or plaintext outside the designated test-message field.

## Preconditions

- Both users have separate funded Starknet test accounts.
- User A can resolve User B's public encryption key and User B can recover the matching channel material.
- The UI reports `Encrypted On-chain` and `Available`.
- The deployed VEIL helper address and test network are independently confirmed.
- `VITE_VEIL_KEY_REGISTRY_ADDRESS` points to the reviewed deployed registry.
- Each device has explicitly registered its public encryption key.

## Device A

1. Log in as User A.
2. Open or create a deal room with User B.
3. Confirm the mode says `Encrypted On-chain`.
4. Enter a unique plaintext test message.
5. Open browser Network and console inspection.
6. Send the message.
7. Confirm a wallet request appears.
8. Record the transaction hash.
9. Inspect calldata and emitted events; confirm the plaintext is absent.
10. Confirm the UI reaches `Submitted on-chain` and `Confirmed`.

## Device B

1. Log in independently as User B.
2. Open the same deal room.
3. Retrieve the new ciphertext.
4. Confirm the message decrypts locally.
5. Confirm the exact plaintext matches.
6. Confirm activity says `Encrypted On-chain`.
7. Confirm no `Shielded` or `Privacy Pool Verified` label appears.

## Negative Checks

1. User C cannot decrypt.
2. Changing ciphertext causes AES-GCM authentication failure.
3. Selecting STRK20 shows `Coming Soon`.
4. STRK20 selection produces no wallet request.
5. No prover process starts.
6. No transaction is generated for unavailable STRK20 mode.

## Result Template

- Date:
- Network:
- Device A wallet (public address only):
- Device B wallet (public address only):
- Helper contract:
- Transaction hash:
- Plaintext absent from calldata: yes/no
- Receiver decryption passed: yes/no
- STRK20 fail-closed passed: yes/no
- Tester notes:
