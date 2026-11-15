import { notFound } from "next/navigation";
import { ObjectView } from "@/components/discoveries/object-view";
import { OBJECTS, objectBySlug } from "@/lib/objects";

export async function generateMetadata({ params }: PageProps<"/discoveries/[slug]">) {
  const o = objectBySlug((await params).slug);
  return { title: o ? `${o.name} · Discoveries · StellarScope` : "Not found" };
}

export function generateStaticParams() {
  return OBJECTS.map((o) => ({ slug: o.slug }));
}

export default async function Page({ params }: PageProps<"/discoveries/[slug]">) {
  const { slug } = await params;
  const obj = objectBySlug(slug);
  if (!obj) notFound();
  return <ObjectView obj={obj} />;
}
