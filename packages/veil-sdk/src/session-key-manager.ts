import {
  VEIL_SESSION_DURATION_MS,
  VEIL_SESSION_PERMISSIONS,
  type CreateVeilSessionInput,
  type RefreshVeilSessionInput,
  type VeilSession,
  type VeilSessionAuthorizationChallenge,
  type VeilSessionAuthorizationResult,
  type VeilSessionDuration,
  type VeilSessionErrorCode,
  type VeilSessionErrorDetails,
  type VeilSessionKeyManagerConfig,
  type VeilSessionPermission,
  type VeilSessionPermissionCheck,
  type VeilSessionRecord,
} from "./session-key-types";
import { createDefaultSessionKeyStore } from "./session-key-store";

const ALL_CHANNELS = "*";
const DEFAULT_DURATION: VeilSessionDuration = "12h";
const DEFAULT_STATEMENT = "Authorize this VEIL session key for private channel actions.";
const permissionSet = new Set<string>(VEIL_SESSION_PERMISSIONS);

function createSessionId(now: number): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const random = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
  return `veil-session-${now.toString(36)}-${random}`;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function resolveExpiresAt(input: { duration?: VeilSessionDuration; expiresAt?: number }, now: number): number {
  if (input.expiresAt !== undefined) {
    return input.expiresAt;
  }

  return now + VEIL_SESSION_DURATION_MS[input.duration ?? DEFAULT_DURATION];
}

function assertSupportedPermissions(permissions: readonly VeilSessionPermission[]): void {
  if (permissions.length === 0) {
    throw new VeilSessionError("Session needs at least one permission.", {
      code: "SESSION_INVALID_PERMISSION",
    });
  }

  for (const permission of permissions) {
    if (!permissionSet.has(permission)) {
      throw new VeilSessionError(`Unsupported session permission: ${permission}`, {
        code: "SESSION_INVALID_PERMISSION",
        permission,
      });
    }
  }
}

function channelAllowed(session: VeilSession, channelId: string | undefined): boolean {
  if (!channelId) {
    return true;
  }

  return session.channelIds.includes(ALL_CHANNELS) || session.channelIds.includes(channelId);
}

export class VeilSessionError extends Error {
  readonly code: VeilSessionErrorCode;
  readonly permission: VeilSessionPermission | undefined;
  readonly channelId: string | undefined;
  readonly action: string | undefined;

  constructor(message: string, details: VeilSessionErrorDetails) {
    super(message);
    this.name = "VeilSessionError";
    this.code = details.code;
    this.permission = details.permission;
    this.channelId = details.channelId;
    this.action = details.action;
  }
}

export class VeilSessionKeyManager {
  readonly cacheKey: string;
  readonly #store = this.#configStore();
  readonly #now: () => number;
  readonly #authorizer: VeilSessionKeyManagerConfig["authorizer"];

  constructor(config: VeilSessionKeyManagerConfig = {}) {
    this.#now = config.now ?? (() => Date.now());
    this.#authorizer = config.authorizer;
    this.cacheKey = config.cacheKey ?? "veil-session";
    if (config.store) {
      this.#store = config.store;
    }
  }

  async createSession(input: CreateVeilSessionInput): Promise<VeilSessionRecord> {
    const createdAt = this.#now();
    const expiresAt = resolveExpiresAt(input, createdAt);
    if (expiresAt <= createdAt) {
      throw new VeilSessionError("Session expiration must be in the future.", {
        code: "SESSION_EXPIRED",
      });
    }

    const permissions = unique(input.permissions);
    assertSupportedPermissions(permissions);
    const channelIds = unique(input.channelIds?.length ? input.channelIds : [ALL_CHANNELS]);
    const sessionId = createSessionId(createdAt);
    const challenge = this.#createChallenge({
      sessionId,
      publicKey: input.publicKey,
      permissions,
      channelIds,
      createdAt,
      expiresAt,
      walletAddress: input.walletAddress,
      chainId: input.chainId,
      statement: input.statement,
    });
    const authorized = this.#authorizer
      ? await this.#authorizer.authorizeSession(challenge)
      : this.#localAuthorization(input.publicKey);

    const session = this.#buildSessionRecord({
      sessionId,
      publicKey: authorized.publicKey,
      permissions,
      channelIds,
      createdAt,
      expiresAt,
      authorization: authorized.authorization,
      keyHandle: authorized.keyHandle,
      walletAddress: authorized.walletAddress ?? input.walletAddress,
      chainId: authorized.chainId ?? input.chainId,
    });

    await this.#store.saveActiveSession(session);
    return session;
  }

  async revokeSession(sessionId?: string): Promise<void> {
    const session = await this.#store.loadActiveSession();
    if (!session) {
      return;
    }

    if (sessionId && session.sessionId !== sessionId) {
      return;
    }

    await this.#authorizer?.revokeSession?.(session);
    await this.#store.removeSession(session.sessionId);
  }

  isExpired(session: VeilSession | null | undefined): boolean {
    return !session || session.expiresAt <= this.#now();
  }

  async hasPermission(permission: VeilSessionPermission, input: VeilSessionPermissionCheck = {}): Promise<boolean> {
    const session = await this.getActiveSession();
    if (!session) {
      return false;
    }

    return session.permissions.includes(permission) && channelAllowed(session, input.channelId);
  }

  async getActiveSession(): Promise<VeilSessionRecord | null> {
    const session = await this.#store.loadActiveSession();
    if (!session) {
      return null;
    }

    if (session.revokedAt) {
      await this.#store.removeSession(session.sessionId);
      return null;
    }

    if (this.isExpired(session)) {
      await this.#store.removeSession(session.sessionId);
      return null;
    }

    return session;
  }

  async refreshSession(input: RefreshVeilSessionInput = {}): Promise<VeilSessionRecord> {
    const current = await this.getActiveSession();
    if (!current) {
      throw new VeilSessionError("No active VEIL session to refresh.", {
        code: "SESSION_REQUIRED",
      });
    }

    if (!this.#authorizer?.refreshSession) {
      throw new VeilSessionError("Refreshing a VEIL session requires a session authorizer.", {
        code: "SESSION_AUTHORIZER_REQUIRED",
      });
    }

    const now = this.#now();
    const expiresAt = resolveExpiresAt(input, now);
    const permissions = unique(input.permissions ?? current.permissions);
    assertSupportedPermissions(permissions);
    const channelIds = unique(input.channelIds ?? current.channelIds);
    const challenge = this.#createChallenge({
      sessionId: current.sessionId,
      publicKey: current.publicKey,
      permissions,
      channelIds,
      createdAt: current.createdAt,
      expiresAt,
      walletAddress: current.walletAddress,
      chainId: current.chainId,
      statement: input.statement,
    });
    const authorized = await this.#authorizer.refreshSession(current, challenge);
    const refreshed = this.#buildSessionRecord({
      sessionId: current.sessionId,
      publicKey: authorized.publicKey,
      permissions,
      channelIds,
      createdAt: current.createdAt,
      expiresAt,
      authorization: authorized.authorization ?? current.authorization,
      keyHandle: authorized.keyHandle ?? current.keyHandle,
      walletAddress: authorized.walletAddress ?? current.walletAddress,
      chainId: authorized.chainId ?? current.chainId,
      refreshedAt: now,
    });

    await this.#store.saveActiveSession(refreshed);
    return refreshed;
  }

  async requirePermission(
    permission: VeilSessionPermission,
    input: VeilSessionPermissionCheck = {},
  ): Promise<VeilSessionRecord> {
    const session = await this.#store.loadActiveSession();
    if (!session) {
      throw new VeilSessionError("Create a VEIL session before performing this action.", {
        code: "SESSION_REQUIRED",
        permission,
        channelId: input.channelId,
        action: input.action,
      });
    }

    if (session.revokedAt) {
      await this.#store.removeSession(session.sessionId);
      throw new VeilSessionError("This VEIL session has been revoked.", {
        code: "SESSION_REVOKED",
        permission,
        channelId: input.channelId,
        action: input.action,
      });
    }

    if (this.isExpired(session)) {
      await this.#store.removeSession(session.sessionId);
      throw new VeilSessionError("This VEIL session has expired.", {
        code: "SESSION_EXPIRED",
        permission,
        channelId: input.channelId,
        action: input.action,
      });
    }

    if (!session.permissions.includes(permission)) {
      throw new VeilSessionError(`VEIL session is missing ${permission}.`, {
        code: "SESSION_PERMISSION_DENIED",
        permission,
        channelId: input.channelId,
        action: input.action,
      });
    }

    if (!channelAllowed(session, input.channelId)) {
      throw new VeilSessionError("VEIL session is not authorized for this channel.", {
        code: "SESSION_CHANNEL_DENIED",
        permission,
        channelId: input.channelId,
        action: input.action,
      });
    }

    return session;
  }

  async clearSession(): Promise<void> {
    await this.#store.clear();
  }

  #configStore() {
    return createDefaultSessionKeyStore();
  }

  #localAuthorization(publicKey: string | undefined): VeilSessionAuthorizationResult {
    if (!publicKey) {
      throw new VeilSessionError("Creating a VEIL session requires an authorizer or a public key.", {
        code: "SESSION_AUTHORIZER_REQUIRED",
      });
    }

    return { publicKey };
  }

  #createChallenge(input: {
    sessionId: string;
    publicKey: string | undefined;
    permissions: readonly VeilSessionPermission[];
    channelIds: readonly string[];
    createdAt: number;
    expiresAt: number;
    walletAddress: string | undefined;
    chainId: string | undefined;
    statement: string | undefined;
  }): VeilSessionAuthorizationChallenge {
    const challenge: VeilSessionAuthorizationChallenge = {
      sessionId: input.sessionId,
      permissions: input.permissions,
      channelIds: input.channelIds,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      statement: input.statement ?? DEFAULT_STATEMENT,
    };
    if (input.publicKey) challenge.publicKey = input.publicKey;
    if (input.walletAddress) challenge.walletAddress = input.walletAddress;
    if (input.chainId) challenge.chainId = input.chainId;
    return challenge;
  }

  #buildSessionRecord(input: {
    sessionId: string;
    publicKey: string;
    permissions: VeilSessionPermission[];
    channelIds: string[];
    createdAt: number;
    expiresAt: number;
    authorization: VeilSessionRecord["authorization"] | undefined;
    keyHandle: string | undefined;
    walletAddress: string | undefined;
    chainId: string | undefined;
    refreshedAt?: number;
  }): VeilSessionRecord {
    const session: VeilSessionRecord = {
      sessionId: input.sessionId,
      publicKey: input.publicKey,
      permissions: input.permissions,
      channelIds: input.channelIds,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    };
    if (input.authorization) session.authorization = input.authorization;
    if (input.keyHandle) session.keyHandle = input.keyHandle;
    if (input.walletAddress) session.walletAddress = input.walletAddress;
    if (input.chainId) session.chainId = input.chainId;
    if (input.refreshedAt) session.refreshedAt = input.refreshedAt;
    return session;
  }
}
