CREATE TABLE IF NOT EXISTS veil_proof_payloads (
    schema_version TEXT NOT NULL
        CHECK (
            schema_version = 'veil-proof-payload-v1'
        ),

    payload_reference TEXT PRIMARY KEY
        CHECK (
            payload_reference
            ~ '^payload_[A-Za-z0-9_-]{16,128}$'
        ),

    request_fingerprint TEXT NOT NULL
        CHECK (
            request_fingerprint
            ~ '^veil-proof-intent-v1:[0-9a-f]{64}$'
        ),

    key_version TEXT NOT NULL
        CHECK (
            key_version
            ~ '^[A-Za-z0-9._-]{1,32}$'
        ),

    nonce BYTEA NOT NULL
        CHECK (
            octet_length(nonce) = 12
        ),

    authentication_tag BYTEA NOT NULL
        CHECK (
            octet_length(authentication_tag) = 16
        ),

    ciphertext BYTEA NOT NULL
        CHECK (
            octet_length(ciphertext)
            BETWEEN 1 AND 1048576
        ),

    ciphertext_sha256 TEXT NOT NULL
        CHECK (
            ciphertext_sha256
            ~ '^[0-9a-f]{64}$'
        ),

    created_at_ms BIGINT NOT NULL
        CHECK (
            created_at_ms >= 0
        ),

    expires_at_ms BIGINT NOT NULL,

    CONSTRAINT veil_proof_payloads_lifetime
        CHECK (
            expires_at_ms > created_at_ms
            AND expires_at_ms
                <= created_at_ms + 604800000
        )
);

CREATE INDEX IF NOT EXISTS
    veil_proof_payloads_expiry_idx
ON veil_proof_payloads (
    expires_at_ms
);
