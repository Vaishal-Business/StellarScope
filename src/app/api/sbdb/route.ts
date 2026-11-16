import type { NextRequest } from "next/server";

/** NASA/JPL Small-Body Database lookup: identity, discovery (who/when/where), size and orbital elements. */
const memo = new Map<string, unknown>();

export async function GET(req: NextRequest) {
  const name = (req.nextUrl.searchParams.get("name") ?? "").replace(/\s*\(.*\)\s*$/, "").trim().slice(0, 60);
  if (!name) return Response.json({ error: "name required" }, { status: 400 });
  if (memo.has(name)) return Response.json(memo.get(name));
  try {
    let j: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let k = 0; k < 3 && !j; k++) {
      const res = await fetch(`https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(name)}&discovery=1&phys-par=1`, { headers: { "User-Agent": "StellarScope/1.0 (NASA Space Apps citizen-science app)" }, signal: AbortSignal.timeout(30_000) });
      const t = await res.text();
      if (t.trimStart().startsWith("{")) j = JSON.parse(t);
      else await new Promise((r) => setTimeout(r, 800));
    }
    if (!j) throw new Error("JPL SBDB is temporarily unavailable");
    if (!j.object) throw new Error(j.message ?? "Object not found in SBDB");
    const el = Object.fromEntries((j.orbit?.elements ?? []).map((e: { name: string; value: string }) => [e.name, Number(e.value)]));
    const phys = Object.fromEntries((j.phys_par ?? []).map((p: { name: string; value: string }) => [p.name, p.value]));
    const out = {
      source: "NASA/JPL Small-Body Database",
      fullname: j.object.fullname,
      kind: j.object.kind,
      orbitClass: j.object.orbit_class?.name,
      neo: j.object.neo,
      pha: j.object.pha,
      discovery: j.discovery ? { text: j.discovery.discovery, who: j.discovery.who, date: j.discovery.date, location: j.discovery.location, citation: j.discovery.citation } : null,
      diameterKm: phys.diameter ? Number(phys.diameter) : null,
      H: phys.H ? Number(phys.H) : null,
      elements: el.a ? { a: el.a, e: el.e, i: el.i, om: el.om, w: el.w, ma: el.ma, epochJd: Number(j.orbit.epoch) } : null,
      url: `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(name)}`,
    };
    memo.set(name, out);
    return Response.json(out);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
