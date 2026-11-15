import "server-only";
import { Pool, types } from "pg";

/**
 * Neon Postgres (DATABASE_URL in .env.local). A thin adapter keeps the original
 * prepare(sql).get/all/run shape (now async) and converts `?` placeholders to $1..$n.
 * Every number the UI shows about the community comes from here — there is no seeded content.
 */
types.setTypeParser(20, (v) => Number(v)); // BIGINT -> number
types.setTypeParser(1700, (v) => Number(v)); // NUMERIC -> number

const g = globalThis as unknown as { __spxpool?: Pool; __spxready?: Promise<void> };

function pool() {
  if (!g.__spxpool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (Neon connection string).");
    g.__spxpool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8, ssl: { rejectUnauthorized: false } });
  }
  return g.__spxpool;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
    pass_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS submissions (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), mission_slug TEXT NOT NULL,
    tile_order INTEGER NOT NULL, tile_ipix INTEGER NOT NULL, interpretation TEXT NOT NULL, confidence INTEGER NOT NULL,
    reasoning TEXT NOT NULL, evidence_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), room TEXT NOT NULL,
    kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, tile_order INTEGER, tile_ipix INTEGER,
    submission_id INTEGER, created_at BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS replies (
    id SERIAL PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS votes (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id),
    PRIMARY KEY (post_id, user_id));
  CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY, submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id), verdict TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL, UNIQUE(submission_id, user_id));
  CREATE TABLE IF NOT EXISTS claims (
    tile_order INTEGER NOT NULL, tile_ipix INTEGER NOT NULL, mission_slug TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id), created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL,
    PRIMARY KEY (tile_order, tile_ipix, mission_slug));
  CREATE TABLE IF NOT EXISTS mission_progress (
    user_id INTEGER NOT NULL REFERENCES users(id), mission_slug TEXT NOT NULL, stage INTEGER NOT NULL DEFAULT 0,
    objectives_json TEXT NOT NULL DEFAULT '[]', updated_at BIGINT NOT NULL, PRIMARY KEY (user_id, mission_slug));
  CREATE TABLE IF NOT EXISTS saved (
    user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL, ref TEXT NOT NULL, label TEXT NOT NULL,
    created_at BIGINT NOT NULL, PRIMARY KEY (user_id, kind, ref));
  CREATE TABLE IF NOT EXISTS scout_runs (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), tile_order INTEGER NOT NULL, tile_ipix INTEGER NOT NULL,
    tile5 INTEGER NOT NULL, ra DOUBLE PRECISION NOT NULL, dec DOUBLE PRECISION NOT NULL, model_version TEXT NOT NULL, best_channel INTEGER,
    track_flag INTEGER NOT NULL, anomaly_flag INTEGER NOT NULL, incomplete INTEGER NOT NULL,
    summary_json TEXT NOT NULL, created_at BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS scout_inputs (key TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at BIGINT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_runs_tile5 ON scout_runs(tile5);
  CREATE INDEX IF NOT EXISTS idx_sub_tile ON submissions(tile_order, tile_ipix);
`;

function ready() {
  g.__spxready ??= pool().query(SCHEMA).then(() => undefined);
  g.__spxready.catch(() => (g.__spxready = undefined));
  return g.__spxready;
}

const RETURNING = /^\s*INSERT\s+INTO\s+(users|posts|replies|submissions|reviews|scout_runs)\b/i;

function toPg(sql: string) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

type Row = Record<string, unknown>;

class Stmt {
  constructor(private sql: string) {}
  private async exec(args: unknown[]) {
    await ready();
    return pool().query(toPg(this.sql), args);
  }
  async get(...args: unknown[]): Promise<Row | undefined> {
    return (await this.exec(args)).rows[0];
  }
  async all(...args: unknown[]): Promise<Row[]> {
    return (await this.exec(args)).rows;
  }
  async run(...args: unknown[]): Promise<{ lastInsertRowid: number; changes: number }> {
    const sql = RETURNING.test(this.sql) && !/RETURNING/i.test(this.sql) ? `${this.sql.replace(/;\s*$/, "")} RETURNING id` : this.sql;
    await ready();
    const r = await pool().query(toPg(sql), args);
    return { lastInsertRowid: Number(r.rows[0]?.id ?? 0), changes: r.rowCount ?? 0 };
  }
}

export function db() {
  return { prepare: (sql: string) => new Stmt(sql) };
}

export const now = () => Date.now();

/** XP is derived from real, recorded actions only. */
export const XP_RULES = { post: 10, reply: 5, review: 40, submission: 60, verified: 200, scout: 15 } as const;
export const RANKS = [
  { name: "Explorer", min: 0 },
  { name: "Observer", min: 200 },
  { name: "Analyst", min: 800 },
  { name: "Investigator", min: 2500 },
  { name: "Discovery Contributor", min: 6000 },
];

export async function userStats(userId: number) {
  const r = (await db()
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM posts WHERE user_id = $1) AS posts,
        (SELECT COUNT(*) FROM replies WHERE user_id = $1) AS replies,
        (SELECT COUNT(*) FROM reviews WHERE user_id = $1) AS reviews,
        (SELECT COUNT(*) FROM submissions WHERE user_id = $1) AS submissions,
        (SELECT COUNT(*) FROM submissions WHERE user_id = $1 AND status = 'verified') AS verified,
        (SELECT COUNT(*) FROM scout_runs WHERE user_id = $1) AS scouts`,
    )
    .get(userId)) as Record<string, number>;
  const { posts, replies, reviews, submissions, verified, scouts } = r;
  const xp = posts * XP_RULES.post + replies * XP_RULES.reply + reviews * XP_RULES.review + submissions * XP_RULES.submission + verified * XP_RULES.verified + scouts * XP_RULES.scout;
  let rank = RANKS[0];
  for (const k of RANKS) if (xp >= k.min) rank = k;
  const next = RANKS[RANKS.indexOf(rank) + 1] ?? null;
  return { posts, replies, reviews, submissions, verified, scouts, xp, rank: rank.name, nextRank: next?.name ?? null, nextXp: next?.min ?? null };
}

/** Submission status from independent reviews (author can't review their own work). */
export async function recomputeStatus(submissionId: number) {
  const r = (await db()
    .prepare("SELECT COUNT(*) FILTER (WHERE verdict='verify') AS v, COUNT(*) FILTER (WHERE verdict='challenge') AS c FROM reviews WHERE submission_id = ?")
    .get(submissionId)) as { v: number; c: number };
  const status = r.v >= 2 && r.v > r.c ? "verified" : r.c >= 1 && r.c >= r.v ? "challenged" : "pending";
  await db().prepare("UPDATE submissions SET status = ? WHERE id = ?").run(status, submissionId);
  return status;
}
