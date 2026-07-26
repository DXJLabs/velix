CREATE TABLE IF NOT EXISTS veil_proof_job_access (
    schema_version TEXT NOT NULL
        CHECK (
            schema_version =
            'veil-proof-job-access-v1'
        ),

    job_id TEXT PRIMARY KEY
        REFERENCES veil_proof_jobs(job_id)
        ON DELETE CASCADE
        CHECK (
            job_id
            ~ '^job_[A-Za-z0-9_-]{16,128}$'
        ),

    subject_hash TEXT NOT NULL
        CHECK (
            subject_hash
            ~ '^[0-9a-f]{64}$'
        ),

    created_at_ms BIGINT NOT NULL
        CHECK (created_at_ms >= 0)
);

COMMENT ON TABLE veil_proof_job_access IS
    'Stores only job-scoped pseudonymous authorization bindings.';

COMMENT ON COLUMN veil_proof_job_access.subject_hash IS
    'Job-scoped HMAC. Never a Privy user ID, wallet address, or session ID.';
