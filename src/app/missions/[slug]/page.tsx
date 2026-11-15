import { notFound } from "next/navigation";
import { MissionFlow } from "@/components/missions/mission-flow";
import { MISSIONS, missionBySlug } from "@/lib/missions";

export async function generateMetadata({ params }: PageProps<"/missions/[slug]">) {
  const m = missionBySlug((await params).slug);
  return { title: m ? `${m.title} · Missions · StellarScope` : "Not found" };
}

export function generateStaticParams() {
  return MISSIONS.filter((m) => m.slug !== "planet-nine").map((m) => ({ slug: m.slug }));
}

export default async function Page({ params }: PageProps<"/missions/[slug]">) {
  const { slug } = await params;
  const m = missionBySlug(slug);
  if (!m) notFound();
  return <MissionFlow mission={m} />;
}

/** Params resolve per request; render as a blocking route. */
export const instant = false;
