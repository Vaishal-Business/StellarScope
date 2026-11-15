import { NextResponse, type NextRequest } from "next/server";
import { indexFits, planeRange, rangeFetch } from "@/server/fits";
import { scienceUrl } from "@/sky/spherex";
import { parseIpix } from "@/server/params";

/**
 * One 512×512 plane of IMAGE / NHITS / FLAGS as raw big-endian bytes (exactly as stored in FITS).
 * Query: ?hdu=IMAGE&plane=40
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/science/[ipix]/plane">) {
  const { ipix: raw } = await ctx.params;
  const ipix = parseIpix(raw);
  const hduName = req.nextUrl.searchParams.get("hdu") ?? "IMAGE";
  const plane = Number(req.nextUrl.searchParams.get("plane") ?? 0);
  if (ipix === null || !["IMAGE", "NHITS", "FLAGS"].includes(hduName) || !Number.isInteger(plane) || plane < 0 || plane > 101) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  try {
    const url = scienceUrl(ipix);
    const idx = await indexFits(url);
    const hdu = idx.hdus.find((h) => h.name === hduName);
    if (!hdu) return NextResponse.json({ error: `${hduName} extension not present` }, { status: 404 });
    const depth = hdu.naxis[2] ?? 1;
    const p = Math.min(plane, depth - 1);
    const r = planeRange(hdu, p);
    const { buf } = await rangeFetch(url, r.start, r.end);
    const card = (k: string) => hdu.cards.find((c) => c.key === k)?.value;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
        "X-Bitpix": String(hdu.bitpix),
        "X-Width": String(r.w),
        "X-Height": String(r.h),
        "X-Plane": String(p),
        "X-Bunit": String(card("BUNIT") ?? ""),
        "X-Bzero": String(card("BZERO") ?? 0),
        "X-Bscale": String(card("BSCALE") ?? 1),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
