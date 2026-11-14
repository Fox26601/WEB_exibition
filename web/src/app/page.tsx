import { LandingPage } from "@/components/landing/landing-page";
import { loadCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const catalog = await loadCatalog("live");
  return <LandingPage initialCatalog={catalog} />;
}
