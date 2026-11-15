import { NextResponse, type NextRequest } from "next/server";
import { groupVisits, querySia } from "@/server/sia";

/** Real SPHEREx Level-2 exposures covering a sky position, via IRSA SIAv2. */
export async function GET(req: NextRequest) {
  const ra = Number(req.nextUrl.searchParams.get("ra"));
  const dec = Number(req.nextUrl.searchParams.get("dec"));
  const collection = req.nextUrl.searchParams.get("collection") === "spherex_qr3" ? "spherex_qr3" : "spherex_dr1";
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || ra < 0 || ra >= 360 || dec < -90 || dec > 90) {
    return NextResponse.json({ error: "ra/dec out of range" }, { status: 400 });
  }
  const t0 = Date.now();
  try {
    const exposures = await querySia(ra, dec, collection);
    const { visits, epochs } = groupVisits(exposures);
    return NextResponse.json({ collection, ra, dec, elapsedMs: Date.now() - t0, count: exposures.length, visits, epochs, exposures });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
