import { auth, isAllowlistedEmail } from "@/lib/auth";
import { AdminNav } from "@/components/admin/admin-nav";
import { Providers } from "@/components/providers";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const allowed =
    !!session?.user?.email && isAllowlistedEmail(session.user.email);

  return (
    <Providers>
      <div className="admin-shell">
        {allowed ? <AdminNav email={session?.user?.email} /> : null}
        <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
      </div>
    </Providers>
  );
}
