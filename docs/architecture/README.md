# Architecture

This section explains the high-level architecture of VEIL.

VEIL is a private Deal Room application built on Starknet. It connects private communication, structured negotiation, payment context, and escrow coordination through Starknet Privacy Pool.

This page focuses on the main system layers, responsibilities, and privacy boundaries.

Low-level SDK APIs, cryptographic parameters, contract ABI details, storage layouts, prover configuration, deployment commands, and source-code analysis belong in the [Technical Documentation](../technical/README.md).

> **Current status:** Pre-production / in development.
>
> The final VEIL architecture uses the official Starknet Privacy SDK and Starknet Privacy Pool. The older direct encrypted helper remains a Legacy implementation and is not the final production path.

## Architecture Goals

VEIL is designed around the following principles:

- all Deal Room communication is private by default;
- private keys and decrypted content remain in the participant’s local runtime;
- public services process ciphertext and public references only;
- Starknet Privacy Pool is the private execution foundation;
- `VeilChannelHelper` stores opaque encrypted application data;
- failed private actions must not silently fall back to a public or Legacy path;
- product status must match the technical evidence that actually exists.

## Product Architecture

```mermaid
flowchart TD
    Alice["Alice"]
    AliceApp["Alice VEIL Application"]
    AliceRuntime["Alice Local Privacy Runtime"]
    PrivacySDK["Official Starknet Privacy SDK"]
    PrivacyPool["Starknet Privacy Pool"]
    Helper["VeilChannelHelper"]
    Starknet["Starknet Storage and Events"]
    Indexer["VEIL Ciphertext-Only Indexer"]
    BobRuntime["Bob Local Privacy Runtime"]
    BobApp["Bob VEIL Application"]
    Bob["Bob"]

    Alice --> AliceApp
    AliceApp --> AliceRuntime
    AliceRuntime --> PrivacySDK
    PrivacySDK --> PrivacyPool
    PrivacyPool -->|"privacy_invoke"| Helper
    Helper --> Starknet
    Starknet --> Indexer
    Indexer --> BobRuntime
    BobRuntime --> BobApp
    BobApp --> Bob
