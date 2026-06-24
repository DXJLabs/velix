export const VEIL_SESSION_PERMISSIONS = [
  "MESSAGE_SEND",
  "OFFER_CREATE",
  "OFFER_ACCEPT",
  "MEMO_SEND",
  "ESCROW_CREATE",
  "ESCROW_UPDATE",
  "TIMELINE_APPEND",
] as const;

export type VeilSessionPermission = (typeof VEIL_SESSION_PERMISSIONS)[number];

export const VEIL_SESSION_DURATION_MS = {
  "1h": 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
} as const;

export type VeilSessionDuration = keyof typeof VEIL_SESSION_DURATION_MS;

export type VeilSession = {
  sessionId: string;
  publicKey: string;
  expiresAt: number;
  createdAt: number;
  permissions: VeilSessionPermission[];
  channelIds: string[];
};

export interface VeilSessionAuthorization {
  signature?: string | readonly string[];
  walletAddress?: string;
  chainId?: string;
  issuedAt: number;
  statement?: string;
}

export interface VeilSessionRecord extends VeilSession {
  authorization?: VeilSessionAuthorization;
  keyHandle?: string;
  walletAddress?: string;
  chainId?: string;
  revokedAt?: number;
  refreshedAt?: number;
}

export interface CreateVeilSessionInput {
  publicKey?: string;
  permissions: readonly VeilSessionPermission[];
  channelIds?: readonly string[];
  duration?: VeilSessionDuration;
  expiresAt?: number;
  walletAddress?: string;
  chainId?: string;
  statement?: string;
}

export interface RefreshVeilSessionInput {
  duration?: VeilSessionDuration;
  expiresAt?: number;
  permissions?: readonly VeilSessionPermission[];
  channelIds?: readonly string[];
  statement?: string;
}

export interface VeilSessionAuthorizationChallenge {
  sessionId: string;
  publicKey?: string;
  permissions: readonly VeilSessionPermission[];
  channelIds: readonly string[];
  createdAt: number;
  expiresAt: number;
  walletAddress?: string;
  chainId?: string;
  statement: string;
}

export interface VeilSessionAuthorizationResult {
  publicKey: string;
  authorization?: VeilSessionAuthorization;
  keyHandle?: string;
  walletAddress?: string;
  chainId?: string;
}

export interface VeilSessionAuthorizer {
  authorizeSession(challenge: VeilSessionAuthorizationChallenge): Promise<VeilSessionAuthorizationResult>;
  refreshSession?(
    session: VeilSessionRecord,
    challenge: VeilSessionAuthorizationChallenge,
  ): Promise<VeilSessionAuthorizationResult>;
  revokeSession?(session: VeilSessionRecord): Promise<void>;
}

export interface VeilSessionKeyStore {
  loadActiveSession(): Promise<VeilSessionRecord | null>;
  saveActiveSession(session: VeilSessionRecord): Promise<void>;
  removeSession(sessionId: string): Promise<void>;
  clear(): Promise<void>;
}

export interface VeilSessionPermissionCheck {
  channelId?: string;
  action?: string;
}

export interface VeilSessionManagerLike {
  getActiveSession(): Promise<VeilSessionRecord | null>;
  requirePermission(
    permission: VeilSessionPermission,
    input?: VeilSessionPermissionCheck,
  ): Promise<VeilSessionRecord>;
}

export interface VeilSessionKeyManagerConfig {
  store?: VeilSessionKeyStore;
  authorizer?: VeilSessionAuthorizer;
  now?: () => number;
  cacheKey?: string;
}

export type VeilSessionErrorCode =
  | "SESSION_REQUIRED"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "SESSION_PERMISSION_DENIED"
  | "SESSION_CHANNEL_DENIED"
  | "SESSION_INVALID_PERMISSION"
  | "SESSION_AUTHORIZER_REQUIRED";

export interface VeilSessionErrorDetails {
  code: VeilSessionErrorCode;
  permission?: VeilSessionPermission | undefined;
  channelId?: string | undefined;
  action?: string | undefined;
}
