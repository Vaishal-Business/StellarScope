import { db, now, userStats } from "@/server/db";
import { HttpError, cleanText, createSession, currentUser, destroySession, handle, hashPassword, verifyPassword } from "@/server/auth";

export async function GET() {
  return handle(async () => {
    const user = await currentUser();
    return { user, stats: user ? await userStats(user.id) : null };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = body.action;
    if (action === "logout") {
      await destroySession();
      return { user: null, stats: null };
    }
    const username = cleanText(body.username, 32, "Username", 3).toLowerCase();
    if (!/^[a-z0-9_.-]+$/.test(username)) throw new HttpError(400, "Username may use letters, numbers, . _ and - only.");
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 8) throw new HttpError(400, "Password must be at least 8 characters.");
    const d = db();
    if (action === "register") {
      const display = cleanText(body.displayName ?? username, 48, "Display name", 1);
      if (await d.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) throw new HttpError(409, "That username is taken.");
      const { salt, hash } = hashPassword(password);
      const r = await d.prepare("INSERT INTO users (username, display_name, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)").run(username, display, hash, salt, now());
      await createSession(Number(r.lastInsertRowid));
    } else if (action === "login") {
      const u = await d.prepare("SELECT id, pass_hash, salt FROM users WHERE username = ?").get(username) as { id: number; pass_hash: string; salt: string } | undefined;
      if (!u || !verifyPassword(password, u.salt, u.pass_hash)) throw new HttpError(401, "Wrong username or password.");
      await createSession(u.id);
    } else throw new HttpError(400, "Unknown action.");
    const user = await d.prepare("SELECT id, username, display_name, created_at FROM users WHERE username = ?").get(username) as { id: number };
    return { user, stats: await userStats(user.id) };
  });
}
