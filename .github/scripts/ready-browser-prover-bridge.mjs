import http from "node:http";
import { readFileSync } from "node:fs";

const host = process.env.VEIL_BRIDGE_HOST?.trim() || "127.0.0.1";
const port = readPort(process.env.VEIL_BRIDGE_PORT, 3001);
const upstreamHost = process.env.VEIL_PROVER_HOST?.trim() || "127.0.0.1";
const upstreamPort = readPort(process.env.VEIL_PROVER_PORT, 3000);
const allowedOriginPath =
  process.env.VEIL_ALLOWED_ORIGIN_PATH?.trim()
  || "/state/allowed-origin";
const maxBodyBytes = 64 * 1024 * 1024;
const heartbeatBytes = `\n${" ".repeat(2048)}`;
const heartbeatIntervalMs = 10_000;

function readPort(value, fallback) {
  const parsed = Number(value || fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("Bridge port configuration is invalid.");
  }
  return parsed;
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

function jsonError(id, message) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    error: {
      code: -32000,
      message,
    },
  });
}

function requestId(body) {
  try {
    return JSON.parse(body).id ?? null;
  } catch {
    return null;
  }
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

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(origin));
    response.end();
    return;
  }

  if (request.method !== "POST" || request.url !== "/") {
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

  request.on("end", () => {
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

    const body = Buffer.concat(chunks);
    const id = requestId(body.toString("utf8"));
    let finished = false;

    response.writeHead(200, {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
    });
    response.write(heartbeatBytes);

    const heartbeat = setInterval(() => {
      if (!finished && !response.destroyed) {
        response.write(heartbeatBytes);
      }
    }, heartbeatIntervalMs);

    const upstream = http.request({
      hostname: upstreamHost,
      port: upstreamPort,
      path: "/",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": body.length,
      },
    }, (upstreamResponse) => {
      const upstreamChunks = [];
      upstreamResponse.on("data", (chunk) => upstreamChunks.push(chunk));
      upstreamResponse.on("end", () => {
        finished = true;
        clearInterval(heartbeat);
        if (!response.destroyed) {
          response.end(Buffer.concat(upstreamChunks));
        }
      });
    });

    upstream.on("error", () => {
      finished = true;
      clearInterval(heartbeat);
      if (!response.destroyed) {
        response.end(jsonError(
          id,
          "Temporary prover bridge failure.",
        ));
      }
    });

    response.on("close", () => {
      if (!finished) upstream.destroy();
      clearInterval(heartbeat);
    });

    upstream.end(body);
  });
});

server.requestTimeout = 0;
server.headersTimeout = 65_000;
server.keepAliveTimeout = 65_000;
server.listen(port, host, () => {
  console.log(`VEIL_PROVER_BRIDGE_READY http://${host}:${port}`);
});
