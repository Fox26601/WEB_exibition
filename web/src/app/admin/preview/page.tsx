import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { PreviewPanel } from "@/components/admin/preview-panel";

export default async function PreviewPage() {
  const session = await requireAdmin();
  if (!session) redirect("/admin/login");
  return <PreviewPanel />;
}
