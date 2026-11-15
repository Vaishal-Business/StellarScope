import { notFound } from "next/navigation";
import { LearnModule } from "@/components/learn/learn-views";
import { MODULES, moduleBySlug } from "@/lib/learn";

export async function generateMetadata({ params }: PageProps<"/learn/[slug]">) {
  const m = moduleBySlug((await params).slug);
  return { title: m ? `${m.title} · Learn · StellarScope` : "Not found" };
}

export function generateStaticParams() {
  return MODULES.map((m) => ({ slug: m.slug }));
}

export default async function Page({ params }: PageProps<"/learn/[slug]">) {
  const { slug } = await params;
  const m = moduleBySlug(slug);
  if (!m) notFound();
  return <LearnModule m={m} />;
}
