import Link from "next/link";
import { signOut } from "@/lib/auth";

export default function ForbiddenPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
      <h1 className="mb-2 font-[family-name:var(--font-display)] text-3xl font-bold text-[#e08a7a]">
        403 — Not allowlisted
      </h1>
      <p className="mb-8 text-[var(--paper-dim)]">
        This Google account is not in <code>ADMIN_EMAILS</code>.
      </p>
      <div className="flex gap-3">
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/admin/login" });
          }}
        >
          <button type="submit" className="btn btn-ghost">
            Sign out
          </button>
        </form>
        <Link href="/" className="btn">
          Home
        </Link>
      </div>
    </div>
  );
}
