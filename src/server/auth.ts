import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db, now } from "./db";

const COOKIE = "spx_session";
const TTL = 1000 * 60 * 60 * 24 * 30;

export interface SessionUser {
  id: number;
  username: string;
  display_name: string;
  created_at: number;
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}

export function verifyPassword(password: string, salt: string, hash: string) {
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const t = now();
  await db().prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(token, userId, t, t + TTL);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL / 1000 });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db().prepare("DELETE FROM sessions WHERE token = ?").run(token);
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = await db()
    .prepare("SELECT u.id, u.username, u.display_name, u.created_at, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?")
    .get(token) as (SessionUser & { expires_at: number }) | undefined;
  if (!row || row.expires_at < now()) return null;
  return { id: row.id, username: row.username, display_name: row.display_name, created_at: row.created_at };
}

export async function requireUser() {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Sign in to do that.");
  return u;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Uniform JSON error handling for route handlers. */
export async function handle<T>(fn: () => Promise<T>) {
  try {
    return Response.json(await fn());
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ error: (e as Error).message ?? "Server error" }, { status: 500 });
  }
}

export function cleanText(v: unknown, max: number, field: string, min = 1) {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < min) throw new HttpError(400, `${field} is required.`);
  if (s.length > max) throw new HttpError(400, `${field} must be at most ${max} characters.`);
  return s;
}

export function tileArg(order: unknown, ipix: unknown) {
  const o = Number(order);
  const i = Number(ipix);
  if (!Number.isInteger(o) || o < 0 || o > 5 || !Number.isInteger(i) || i < 0 || i >= 12 * 4 ** o) throw new HttpError(400, "Invalid HEALPix tile.");
  return { order: o, ipix: i };
}
