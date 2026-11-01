#!/usr/bin/env node
/**
 * A stand-in for Turso, for testing the cloud driver without an account.
 *
 * It speaks the same protocol the real thing does — Hrana v2 over HTTP
 * (`POST /v2/pipeline`) — and executes the statements with `node:sqlite` in a
 * file, so what runs here is the same SQL against a real SQLite engine. It is
 * not a Turso replacement for production; it is what makes
 *
 *     TURSO_DATABASE_URL=http://127.0.0.1:8081 TURSO_AUTH_TOKEN=dev
 *
 * a green test run instead of a wish.
 *
 *   node scripts/turso-mock.mjs [port] [file]
 */
import { createServer } from "node:http";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const port = Number(process.argv[2] ?? 8081);
const file = resolve(process.argv[3] ?? "/tmp/turso-mock.db");

rmSync(file, { force: true });
rmSync(`${file}-wal`, { force: true });
rmSync(`${file}-shm`, { force: true });
mkdirSync(dirname(file), { recursive: true });

const root = new DatabaseSync(file);
root.exec("PRAGMA foreign_keys = ON");

/** A "stream" is what Turso calls a session: a connection, possibly mid-transaction. */
const streams = new Map();
let nextStream = 1;

const value = (v) => {
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "bigint") return { type: "integer", value: String(v) };
  if (typeof v === "number")
    return Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v };
  if (typeof v === "string") return { type: "text", value: v };
  if (v instanceof Uint8Array) return { type: "blob", value: Buffer.from(v).toString("base64") };
  return { type: "text", value: String(v) };
};

const toSqlite = (proto) => {
  switch (proto?.type) {
    case "null":
      return null;
    case "integer":
      return Number(proto.value);
    case "float":
      return Number(proto.value);
    case "text":
      return proto.value;
    case "blob":
      return new Uint8Array(Buffer.from(proto.value, "base64"));
    default:
      return null;
  }
};

const stored = new Map(); // sql_id -> sql, per stream

function runStatement(stream, stmt, sqlText) {
  const sql = sqlText ?? stmt.sql ?? stored.get(`${stream.id}:${stmt.sql_id}`);
  if (!sql) throw Object.assign(new Error("no such statement"), { code: "SQLITE_ERROR" });

  const positional = (stmt.args ?? []).map(toSqlite);
  const named = stmt.named_args ?? [];
  const prepared = stream.conn.prepare(sql);

  let rows = [];
  let columns = [];
  if (named.length > 0) {
    const bundle = {};
    for (const { name, value: v } of named) bundle[name] = toSqlite(v);
    const isQuery = /^\s*(select|pragma|with|explain)\b/i.test(sql) || stmt.want_rows;
    if (isQuery) {
      rows = prepared.all(bundle);
      columns = prepared.columns?.() ?? [];
    } else {
      prepared.run(bundle);
    }
  } else {
    const isQuery = /^\s*(select|pragma|with|explain)\b/i.test(sql) || stmt.want_rows;
    if (isQuery) {
      rows = prepared.all(...positional);
      columns = prepared.columns?.() ?? [];
    } else {
      prepared.run(...positional);
    }
  }

  const changes = stream.conn.prepare("SELECT changes() AS n, last_insert_rowid() AS id").get();
  // `columns()` hands back descriptors, not names.
  const names = (columns.length ? columns.map((c) => c.name) : Object.keys(rows[0] ?? {}));
  return {
    cols: names.map((name) => ({ name, decltype: null })),
    rows: rows.map((row) => names.map((name) => value(row[name]))),
    affected_row_count: Number(changes?.n ?? 0),
    last_insert_rowid: changes?.id === null || changes?.id === undefined ? null : String(changes.id),
    rows_read: 0,
    rows_written: Number(changes?.n ?? 0),
    query_duration_ms: 0,
  };
}

const ok = (response) => ({ type: "ok", response });
const fail = (error) => ({
  type: "error",
  error: { message: error.message ?? String(error), code: error.code ?? "SQLITE_ERROR" },
});

function handleRequest(stream, request) {
  switch (request.type) {
    case "execute":
      return ok({ type: "execute", result: runStatement(stream, request.stmt) });
    case "batch": {
      const stepResults = [];
      const stepErrors = [];
      let halted = false;
      for (const [index, step] of request.batch.steps.entries()) {
        const condition = step.condition;
        const allowed =
          !condition ||
          (condition.type === "ok" && !stepErrors[condition.step]) ||
          (condition.type === "error" && Boolean(stepErrors[condition.step]));
        if (!allowed || halted) {
          stepResults.push(null);
          continue;
        }
        try {
          // A batch step result is the statement result itself, not a wrapped
          // response — that is what the client's decoder expects.
          stepResults.push(runStatement(stream, step.stmt));
        } catch (error) {
          stepErrors[index] = fail(error).error;
          stepResults.push(null);
          if (!condition) halted = true;
        }
      }
      return ok({ type: "batch", result: { step_results: stepResults, step_errors: stepErrors } });
    }
    case "sequence": {
      for (const statement of String(request.sql ?? "").split(";")) {
        if (statement.trim()) stream.conn.exec(statement);
      }
      return ok({ type: "sequence" });
    }
    case "store_sql":
      stored.set(`${stream.id}:${request.sql_id}`, request.sql);
      return ok({ type: "store_sql" });
    case "close":
      return ok({ type: "close" });
    case "get_autocommit":
      return ok({ type: "get_autocommit", is_autocommit: !stream.conn.isTransaction });
    case "open_stream":
      return ok({ type: "open_stream" });
    default:
      return fail(new Error(`unsupported request type: ${request.type}`));
  }
}

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    if (process.env.TURSO_MOCK_DEBUG) console.error("[mock] <-", body.slice(0, 300));
    if (!req.url?.startsWith("/v2/pipeline")) {
      res.writeHead(404).end("not found");
      return;
    }

    let payload;
    try {
      payload = JSON.parse(body || "{}");
    } catch {
      res.writeHead(400).end("bad json");
      return;
    }

    // The baton comes back in the body (the client we test against does this);
    // the header form is in the protocol too, so accept both.
    const incoming =
      (typeof payload.baton === "string" ? payload.baton : null) ??
      (req.headers["x-libsql-baton"] ? String(req.headers["x-libsql-baton"]) : null);
    let stream = incoming ? streams.get(incoming) : undefined;
    if (!stream) {
      stream = { id: `s${nextStream++}`, conn: root };
      // Every request gets its own handle on the same file, so two "connections"
      // behave like two Turso connections rather than one shared one.
      stream.conn = new DatabaseSync(file);
      stream.conn.exec("PRAGMA foreign_keys = ON");
      streams.set(stream.id, stream);
    }

    const results = (payload.requests ?? []).map((request) => {
      try {
        return handleRequest(stream, request);
      } catch (error) {
        if (process.env.TURSO_MOCK_DEBUG) {
          console.error("[mock] failed", JSON.stringify(request).slice(0, 400), "-", error.message);
        }
        return fail(error);
      }
    });

    // A stream lives exactly as long as a transaction is open on it. Anything
    // else is one request, one connection — like Turso.
    const inTransaction = Boolean(stream.conn.isTransaction);
    if (!inTransaction) {
      streams.delete(stream.id);
      stream.conn.close();
    }
    const baton = inTransaction ? stream.id : null;

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ baton, base_url: null, results }));
    void payload;
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`turso-mock listening on http://127.0.0.1:${port} (db: ${file})`);
});
