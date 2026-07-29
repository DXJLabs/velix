import http from "node:http";
import { readFileSync } from "node:fs";

const host = process.env.VEIL_RPC_BRIDGE_HOST?.trim() || "127.0.0.1";
const port = readPort(process.env.VEIL_RPC_BRIDGE_PORT, 3002);
const rpcPath = process.env.VEIL_RPC_PUBLIC_PATH?.trim() || "/rpc/v0_9";
const allowedOriginPath =
  process.env.VEIL_ALLOWED_ORIGIN_PATH?.trim()
  || "/state/allowed-origin";
const upstreamRpcUrl = requiredUrl(process.env.VEIL_UPSTREAM_RPC_URL);
const maxBodyBytes = 8 * 1024 * 1024;

function readPort(value, fallback) {
  const parsed = Number(value || fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("RPC bridge port configuration is invalid.");
  }
  return parsed;
}

function requiredUrl(value) {
  const normalized = String(value || "").trim();
  const parsed = new URL(normalized);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("RPC bridge upstream must use HTTP(S).");
  }
  return parsed.toString();
}

function allowedOrigin() {
  try {
    return readFileSync(allowedOriginPath, "utf8").trim();
  } catch {
    return "";
  }
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function writeJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

const server = http.createServer((request, response) => {
  const origin = String(request.headers.origin || "");
  const allowed = allowedOrigin();

  if (request.method === "GET" && request.url === "/health") {
    writeJson(response, 200, {
      status: "ready",
      originConfigured: Boolean(allowed),
    });
    return;
  }

  if (!allowed || origin !== allowed) {
    writeJson(response, 403, { error: "origin_not_allowed" });
    return;
  }

  if (request.method === "OPTIONS" && request.url === rpcPath) {
    response.writeHead(204, corsHeaders(origin));
    response.end();
    return;
  }

  if (request.method !== "POST" || request.url !== rpcPath) {
    writeJson(
      response,
      405,
      { error: "method_not_allowed" },
      corsHeaders(origin),
    );
    return;
  }

  const chunks = [];
  let bodyBytes = 0;
  let rejected = false;

  request.on("data", (chunk) => {
    bodyBytes += chunk.length;
    if (bodyBytes > maxBodyBytes) {
      rejected = true;
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });

  request.on("end", async () => {
    if (rejected) {
      if (!response.destroyed) {
        writeJson(
          response,
          413,
          { error: "request_too_large" },
          corsHeaders(origin),
        );
      }
      return;
    }

    try {
      const upstreamResponse = await fetch(upstreamRpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: Buffer.concat(chunks),
        signal: AbortSignal.timeout(60_000),
      });
      const payload = Buffer.from(await upstreamResponse.arrayBuffer());
      response.writeHead(upstreamResponse.status, {
        ...corsHeaders(origin),
        "Content-Type":
          upstreamResponse.headers.get("content-type")
          || "application/json",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(payload);
    } catch {
      if (!response.destroyed) {
        writeJson(
          response,
          502,
          {
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32000,
              message: "Temporary Starknet RPC bridge failure.",
            },
          },
          corsHeaders(origin),
        );
      }
    }
  });
});

server.requestTimeout = 70_000;
server.headersTimeout = 65_000;
server.keepAliveTimeout = 65_000;
server.listen(port, host, () => {
  console.log(`VEIL_RPC_BRIDGE_READY http://${host}:${port}${rpcPath}`);
});
