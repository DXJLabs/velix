import assert from "node:assert/strict";
import test from "node:test";

import { createWalletAuthService } from "../frontend/src/services/wallet/wallet-auth-service.js";

function fakeFetch(handlers) {
  return async (url, init) => {
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const handler = handlers[path];
    if (!handler) throw new Error(`Unexpected fetch to ${path}`);
    return handler(JSON.parse(init.body || "{}"), init);
  };
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("signIn walks challenge -> wallet signature -> verify and stores a session", async () => {
  let signedTypedData;
  const wallet = {
    async request({ type, params }) {
      assert.equal(type, "wallet_signTypedData");
      signedTypedData = params;
      return ["0x1", "0x2"];
    },
  };

  const fetchImpl = fakeFetch({
    "/api/auth/challenge": (body) => {
      assert.equal(body.address, "0xabc");
      return jsonResponse(200, {
        message: "sign in",
        typedData: { primaryType: "Message" },
        challengeToken: "token-1",
        expiresAtMs: Date.now() + 60_000,
      });
    },
    "/api/auth/verify": (body) => {
      assert.equal(body.address, "0xabc");
      assert.equal(body.challengeToken, "token-1");
      assert.deepEqual(body.signature, ["0x1", "0x2"]);
      return jsonResponse(200, { sessionToken: "session-1", expiresAtMs: Date.now() + 120_000 });
    },
  });

  const service = createWalletAuthService({ fetchImpl });
  const session = await service.signIn(wallet, "0xabc");

  assert.equal(session.sessionToken, "session-1");
  assert.equal(signedTypedData.primaryType, "Message");
  assert.equal(service.getSession().sessionToken, "session-1");
});

test("authenticatedFetch attaches the bearer session token", async () => {
  const wallet = { async request() { return ["0x1"]; } };
  const fetchImpl = fakeFetch({
    "/api/auth/challenge": () => jsonResponse(200, {
      typedData: {}, challengeToken: "t", expiresAtMs: Date.now() + 60_000,
    }),
    "/api/auth/verify": () => jsonResponse(200, { sessionToken: "session-2", expiresAtMs: Date.now() + 60_000 }),
    "/api/messaging/prepare": (_body, init) => {
      assert.equal(init.headers.Authorization, "Bearer session-2");
      return jsonResponse(200, { ok: true });
    },
  });

  const service = createWalletAuthService({ fetchImpl });
  await service.signIn(wallet, "0xdef");
  const response = await service.authenticatedFetch("/api/messaging/prepare", {
    method: "POST",
    headers: {},
  });
  assert.equal((await response.json()).ok, true);
});

test("authenticatedFetch without a prior sign-in fails closed", async () => {
  const service = createWalletAuthService({ fetchImpl: fakeFetch({}) });
  await assert.rejects(
    () => service.authenticatedFetch("/api/messaging/prepare"),
    /No wallet session/,
  );
});

test("an expired session is treated as absent", async () => {
  const wallet = { async request() { return ["0x1"]; } };
  const fetchImpl = fakeFetch({
    "/api/auth/challenge": () => jsonResponse(200, {
      typedData: {}, challengeToken: "t", expiresAtMs: Date.now() + 60_000,
    }),
    "/api/auth/verify": () => jsonResponse(200, { sessionToken: "session-3", expiresAtMs: Date.now() - 1 }),
  });

  const service = createWalletAuthService({ fetchImpl });
  await service.signIn(wallet, "0xdef");
  assert.equal(service.getSession(), null);
});

test("a wallet that cannot sign fails the sign-in with a clear error", async () => {
  const fetchImpl = fakeFetch({
    "/api/auth/challenge": () => jsonResponse(200, {
      typedData: {}, challengeToken: "t", expiresAtMs: Date.now() + 60_000,
    }),
  });

  const service = createWalletAuthService({ fetchImpl });
  await assert.rejects(
    () => service.signIn({}, "0xdef"),
    /does not support signing/,
  );
});
