BEGIN;

CREATE TABLE veil_api_rate_limits (
  scope TEXT NOT NULL,
  identity_hash CHAR(64) NOT NULL,
  window_start_ms BIGINT NOT NULL,
  expires_at_ms BIGINT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,

  PRIMARY KEY (
    scope,
    identity_hash,
    window_start_ms
  ),

  CONSTRAINT veil_api_rate_limits_scope_check
    CHECK (
      scope ~ '^[A-Za-z0-9:_/-]{1,160}$'
    ),

  CONSTRAINT veil_api_rate_limits_identity_hash_check
    CHECK (
      identity_hash ~ '^[0-9a-f]{64}$'
    ),

  CONSTRAINT veil_api_rate_limits_window_check
    CHECK (
      window_start_ms >= 0
      AND expires_at_ms > window_start_ms
    ),

  CONSTRAINT veil_api_rate_limits_count_check
    CHECK (
      request_count >= 1
      AND request_count <= 1000000
    )
);

CREATE INDEX
  veil_api_rate_limits_expiry_idx
ON veil_api_rate_limits (
  expires_at_ms
);

COMMIT;
