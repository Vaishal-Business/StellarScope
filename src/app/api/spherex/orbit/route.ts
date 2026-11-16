import { db } from "@/server/db";

/**
 * Current SPHEREx two-line element set from CelesTrak (NORAD 63182), cached 6 h in memory.
 * The last real TLE is also stored in Postgres so a CelesTrak outage serves it, labelled stale.
 */
const KEY = "tle:63182";
let cache: { t: number; tle: string[] } | null = null;

async function fetchTle(): Promise<string[]> {
  let last: Error = new Error("No TLE returned");
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch("https://celestrak.org/NORAD/elements/gp.php?CATNR=63182&FORMAT=TLE", { headers: { "User-Agent": "StellarScope/1.0" }, signal: AbortSignal.timeout(20_000) });
      const lines = (await res.text()).split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
      if (res.ok && lines.length >= 3 && lines[1].startsWith("1 ")) return lines.slice(0, 3);
      last = new Error(`CelesTrak HTTP ${res.status}`);
    } catch (e) {
      last = e as Error;
    }
  }
  throw last;
}

export async function GET() {
  if (cache && Date.now() - cache.t < 6 * 3600e3) return Response.json({ source: "CelesTrak", tle: cache.tle, fetchedAt: new Date(cache.t).toISOString() });
  try {
    const tle = await fetchTle();
    cache = { t: Date.now(), tle };
    const payload = JSON.stringify(cache);
    await db().prepare("INSERT INTO scout_inputs (key, payload, created_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at").run(KEY, payload, Date.now()).catch(() => {});
    return Response.json({ source: "CelesTrak", tle, fetchedAt: new Date(cache.t).toISOString() });
  } catch (e) {
    if (!cache) {
      const row = (await db().prepare("SELECT payload FROM scout_inputs WHERE key = ?").get(KEY).catch(() => undefined)) as { payload: string } | undefined;
      if (row) cache = JSON.parse(row.payload);
    }
    if (cache) return Response.json({ source: "CelesTrak (last known)", tle: cache.tle, fetchedAt: new Date(cache.t).toISOString() });
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
