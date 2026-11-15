import { db, now, recomputeStatus } from "@/server/db";
import { HttpError, handle, requireUser } from "@/server/auth";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requireUser();
    const id = Number((await ctx.params).id);
    const s = await db().prepare("SELECT user_id FROM submissions WHERE id = ?").get(id) as { user_id: number } | undefined;
    if (!s) throw new HttpError(404, "Submission not found.");
    if (s.user_id === me.id) throw new HttpError(403, "You can't review your own submission.");
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const verdict = b.verdict === "verify" || b.verdict === "challenge" ? b.verdict : null;
    if (!verdict) throw new HttpError(400, "Verdict must be verify or challenge.");
    const note = typeof b.note === "string" ? b.note.trim().slice(0, 2000) : "";
    if (verdict === "challenge" && note.length < 10) throw new HttpError(400, "Explain your challenge with evidence (10+ characters).");
    await db()
      .prepare("INSERT INTO reviews (submission_id, user_id, verdict, note, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(submission_id, user_id) DO UPDATE SET verdict = excluded.verdict, note = excluded.note, created_at = excluded.created_at")
      .run(id, me.id, verdict, note, now());
    return { status: await recomputeStatus(id) };
  });
}
