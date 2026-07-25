CREATE TABLE IF NOT EXISTS veil_proof_jobs (
    schema_version TEXT NOT NULL
        CHECK (schema_version = 'veil-proof-job-v1'),

    job_id TEXT PRIMARY KEY
        CHECK (job_id ~ '^job_[A-Za-z0-9_-]{16,128}$'),

    request_fingerprint TEXT NOT NULL
        CHECK (
            request_fingerprint
            ~ '^veil-proof-intent-v1:[0-9a-f]{64}$'
        ),

    idempotency_key_hash TEXT NOT NULL UNIQUE
        CHECK (
            idempotency_key_hash
            ~ '^[0-9a-f]{64}$'
        ),

    payload_reference TEXT NOT NULL
        CHECK (
            payload_reference
            ~ '^[A-Za-z0-9:_-]{1,200}$'
        ),

    state TEXT NOT NULL
        CHECK (
            state IN (
                'queued',
                'running',
                'succeeded',
                'failed',
                'cancelled'
            )
        ),

    revision INTEGER NOT NULL
        CHECK (revision >= 0),

    attempts INTEGER NOT NULL
        CHECK (attempts >= 0),

    max_attempts INTEGER NOT NULL
        CHECK (
            max_attempts BETWEEN 1 AND 10
            AND attempts <= max_attempts
        ),

    created_at_ms BIGINT NOT NULL
        CHECK (created_at_ms >= 0),

    updated_at_ms BIGINT NOT NULL
        CHECK (updated_at_ms >= created_at_ms),

    available_at_ms BIGINT NOT NULL
        CHECK (available_at_ms >= 0),

    lease_owner_hash TEXT
        CHECK (
            lease_owner_hash IS NULL
            OR lease_owner_hash ~ '^[0-9a-f]{64}$'
        ),

    lease_expires_at_ms BIGINT
        CHECK (
            lease_expires_at_ms IS NULL
            OR lease_expires_at_ms >= 0
        ),

    cancellation_requested_at_ms BIGINT
        CHECK (
            cancellation_requested_at_ms IS NULL
            OR cancellation_requested_at_ms >= 0
        ),

    completed_at_ms BIGINT
        CHECK (
            completed_at_ms IS NULL
            OR completed_at_ms >= 0
        ),

    result_reference TEXT
        CHECK (
            result_reference IS NULL
            OR result_reference ~ '^[A-Za-z0-9:_-]{1,200}$'
        ),

    failure_code TEXT
        CHECK (
            failure_code IS NULL
            OR failure_code ~ '^[A-Z][A-Z0-9_]{2,63}$'
        ),

    failure_retryable BOOLEAN,

    CONSTRAINT veil_proof_jobs_failure_shape
        CHECK (
            (failure_code IS NULL)
            =
            (failure_retryable IS NULL)
        ),

    CONSTRAINT veil_proof_jobs_lease_shape
        CHECK (
            (
                state = 'running'
                AND lease_owner_hash IS NOT NULL
                AND lease_expires_at_ms IS NOT NULL
                AND lease_expires_at_ms > updated_at_ms
            )
            OR
            (
                state <> 'running'
                AND lease_owner_hash IS NULL
                AND lease_expires_at_ms IS NULL
            )
        ),

    CONSTRAINT veil_proof_jobs_completion_shape
        CHECK (
            (
                state IN (
                    'succeeded',
                    'failed',
                    'cancelled'
                )
            )
            =
            (completed_at_ms IS NOT NULL)
        ),

    CONSTRAINT veil_proof_jobs_result_shape
        CHECK (
            (
                state = 'succeeded'
                AND result_reference IS NOT NULL
                AND failure_code IS NULL
            )
            OR
            (
                state = 'failed'
                AND result_reference IS NULL
                AND failure_code IS NOT NULL
            )
            OR
            (
                state IN (
                    'queued',
                    'running',
                    'cancelled'
                )
                AND result_reference IS NULL
            )
        ),

    CONSTRAINT veil_proof_jobs_cancellation_shape
        CHECK (
            cancellation_requested_at_ms IS NULL
            OR state IN (
                'running',
                'cancelled'
            )
        )
);

CREATE INDEX IF NOT EXISTS
    veil_proof_jobs_queue_order_idx
ON veil_proof_jobs (
    available_at_ms,
    created_at_ms,
    job_id
)
WHERE state = 'queued';

CREATE INDEX IF NOT EXISTS
    veil_proof_jobs_running_lease_idx
ON veil_proof_jobs (
    lease_expires_at_ms
)
WHERE state = 'running';
