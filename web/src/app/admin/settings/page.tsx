import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { SettingsForm } from "@/components/admin/settings-form";

export default async function SettingsPage() {
  const session = await requireAdmin();
  if (!session) redirect("/admin/login");
  return <SettingsForm />;
}
