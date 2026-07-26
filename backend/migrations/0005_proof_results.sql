CREATE TABLE IF NOT EXISTS veil_proof_results (
    schema_version TEXT NOT NULL
        CHECK (
            schema_version =
            'veil-proof-result-v1'
        ),

    result_reference TEXT PRIMARY KEY
        CHECK (
            result_reference
            ~ '^result_[0-9a-f]{64}$'
        ),

    job_id TEXT NOT NULL UNIQUE
        REFERENCES veil_proof_jobs(job_id)
        ON DELETE CASCADE
        CHECK (
            job_id
            ~ '^job_[A-Za-z0-9_-]{16,128}$'
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
        CHECK (octet_length(nonce) = 12),

    authentication_tag BYTEA NOT NULL
        CHECK (
            octet_length(authentication_tag) = 16
        ),

    ciphertext BYTEA NOT NULL
        CHECK (
            octet_length(ciphertext)
            BETWEEN 1 AND 2097152
        ),

    ciphertext_sha256 TEXT NOT NULL
        CHECK (
            ciphertext_sha256
            ~ '^[0-9a-f]{64}$'
        ),

    proof_size_bytes INTEGER NOT NULL
        CHECK (
            proof_size_bytes
            BETWEEN 1 AND 1048576
        ),

    created_at_ms BIGINT NOT NULL
        CHECK (created_at_ms >= 0),

    expires_at_ms BIGINT NOT NULL
        CHECK (expires_at_ms > created_at_ms)
);

CREATE INDEX IF NOT EXISTS
    veil_proof_results_expiry_idx
ON veil_proof_results (
    expires_at_ms,
    result_reference
);

COMMENT ON TABLE veil_proof_results IS
    'Encrypted official transaction-prover results.';

COMMENT ON COLUMN veil_proof_results.ciphertext IS
    'AES-256-GCM ciphertext; never plaintext proof JSON.';
