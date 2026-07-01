# Indexer Reference

The current indexer endpoint reads VEIL helper events for a channel and returns timeline metadata to the application.

Source: [`api/indexer/messages.js`](../../api/indexer/messages.js)

## Current Behavior

- Accepts `GET` requests.
- Requires a `channelId` or `channel_id` query parameter.
- Reads Starknet events from the configured helper contract.
- Normalizes channel identifiers to felt values.
- Parses helper timeline events and payload chunks.
- Returns message metadata sorted by event id.

## Configuration

- `STARKNET_RPC_URL` or `VITE_STARKNET_RPC_URL`
- `VEIL_CHANNEL_HELPER_ADDRESS` or `VITE_VEIL_CHANNEL_HELPER_ADDRESS`
- `VEIL_INDEXER_FROM_BLOCK`

## Boundaries

- The endpoint does not decrypt plaintext.
- The endpoint does not submit transactions.
- The endpoint does not provide Privacy Pool proof generation.
- The endpoint supports the product timeline by returning confirmed channel metadata.
