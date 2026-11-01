/** The HTTP bits `node:http` leaves to you. */

const MAX_BODY = 256 * 1024;

export function parseCookies(header = "") {
  const cookies = {};
  for (const part of String(header).split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

export async function readBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return new URLSearchParams();
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("body too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  const type = request.headers["content-type"] ?? "";
  if (type.includes("application/json")) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(JSON.parse(raw || "{}"))) params.set(key, String(value));
    return params;
  }
  return new URLSearchParams(raw);
}

export function cookie(name, value, { maxAge = 60 * 60 * 24 * 30, secure = false } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function html(response, body, { status = 200, cookies = [] } = {}) {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-frame-options": "DENY",
    "x-robots-tag": "noindex, nofollow",
    "referrer-policy": "no-referrer",
    ...(cookies.length ? { "set-cookie": cookies } : {}),
  });
  response.end(body);
}

export function json(response, value, { status = 200, cookies = [] } = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...(cookies.length ? { "set-cookie": cookies } : {}),
  });
  response.end(JSON.stringify(value, null, 2));
}

export function redirect(response, location, { status = 303, cookies = [] } = {}) {
  response.writeHead(status, { location, ...(cookies.length ? { "set-cookie": cookies } : {}) });
  response.end();
}

export function text(response, body, { status = 200, type = "text/plain; charset=utf-8" } = {}) {
  response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  response.end(body);
}
