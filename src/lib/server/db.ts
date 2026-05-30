import "server-only";

import mysql from "mysql2/promise";

/**
 * Shared MySQL/MariaDB connection pool. SERVER ONLY.
 *
 * Reads connection settings from env (set these in Hostinger → hPanel and in
 * .env.local for local dev):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 *
 * The pool is created lazily and memoised across hot-reloads / Fluid Compute
 * instance reuse via a global, so we never exhaust connections.
 */

declare global {
  var __unibox_pool: mysql.Pool | undefined;
}

function createPool(): mysql.Pool {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_NAME) {
    throw new Error(
      "Database is not configured. Set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME.",
    );
  }
  return mysql.createPool({
    host: DB_HOST,
    port: DB_PORT ? Number(DB_PORT) : 3306,
    user: DB_USER,
    password: DB_PASSWORD ?? "",
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    charset: "utf8mb4",
    timezone: "Z",
    // Return DATETIME as ISO strings (UTC) rather than JS Date, so our API
    // payloads stay plain ISO-8601 like the rest of the app expects.
    dateStrings: true,
  });
}

export function pool(): mysql.Pool {
  if (!global.__unibox_pool) global.__unibox_pool = createPool();
  return global.__unibox_pool;
}

/** Allowed bound-parameter types for a prepared statement. */
export type SqlParam = string | number | boolean | null;

/** Runs a parameterised query and returns the rows typed as T[]. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: SqlParam[] = [],
): Promise<T[]> {
  const [rows] = await pool().execute(sql, params);
  return rows as T[];
}

/** Runs a query expected to return a single row (or null). */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: SqlParam[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Runs an INSERT/UPDATE/DELETE; returns affectedRows. */
export async function execute(sql: string, params: SqlParam[] = []): Promise<number> {
  const [result] = await pool().execute(sql, params);
  return (result as mysql.ResultSetHeader).affectedRows ?? 0;
}

/** Converts a MySQL DATETIME string ("YYYY-MM-DD HH:MM:SS", UTC) to ISO-8601. */
export function toIso(dt: string | Date | null | undefined): string {
  if (!dt) return new Date(0).toISOString();
  if (dt instanceof Date) return dt.toISOString();
  // dateStrings gives UTC "YYYY-MM-DD HH:MM:SS"; append Z to mark it UTC.
  return new Date(dt.replace(" ", "T") + "Z").toISOString();
}
