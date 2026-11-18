import Link from "next/link";
import { signOut } from "@/lib/auth";

export default async function ForbiddenPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const isConfig = error === "Configuration";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
      <h1 className="mb-2 font-[family-name:var(--font-display)] text-3xl font-bold text-[#e08a7a]">
        {isConfig ? "Auth configuration error" : "403 — Not allowlisted"}
      </h1>
      <p className="mb-8 text-[var(--paper-dim)]">
        {isConfig ? (
          <>
            The server could not start Google sign-in (Auth.js{" "}
            <code>Configuration</code>). On Vercel project <strong>web</strong>,
            check Production env: <code>AUTH_SECRET</code>,{" "}
            <code>AUTH_GOOGLE_ID</code>, <code>AUTH_GOOGLE_SECRET</code>, then{" "}
            <strong>Redeploy</strong>. Until this is fixed, the Google account
            picker will not appear.
          </>
        ) : (
          <>
            This Google account is not in <code>ADMIN_EMAILS</code>.
          </>
        )}
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
        <Link href="/admin/login" className="btn">
          Try login again
        </Link>
        <Link href="/" className="btn btn-ghost">
          Home
        </Link>
      </div>
    </div>
  );
}