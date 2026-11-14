import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { ArtworksManager } from "@/components/admin/artworks-manager";

export default async function ArtworksPage() {
  const session = await requireAdmin();
  if (!session) redirect("/admin/login");
  return <ArtworksManager />;
}
