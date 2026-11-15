import { Suspense } from "react";
import { notFound } from "next/navigation";
import { RegionView } from "@/components/region/region-view";

export const metadata = { title: "Region · StellarScope" };

async function Region({ params }: { params: Promise<{ order: string; ipix: string }> }) {
  const { order: o, ipix: i } = await params;
  const order = Number(o);
  const ipix = Number(i);
  if (!Number.isInteger(order) || order < 0 || order > 5 || !Number.isInteger(ipix) || ipix < 0 || ipix >= 12 * 4 ** order) notFound();
  return <RegionView order={order} ipix={ipix} />;
}

export default function Page(props: PageProps<"/region/[order]/[ipix]">) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">Resolving region…</div>}>
      <Region params={props.params} />
    </Suspense>
  );
}
