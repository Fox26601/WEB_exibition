import { redirect } from "next/navigation";
import { auth, isAllowlistedEmail, signIn } from "@/lib/auth";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  if (session?.user?.email && isAllowlistedEmail(session.user.email)) {
    redirect(params.callbackUrl || "/admin");
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
      <h1 className="mb-2 font-[family-name:var(--font-display)] text-3xl font-bold">
        Admin
      </h1>
      <p className="mb-8 text-[var(--paper-dim)]">
        Sign in with a Google account listed in <code>ADMIN_EMAILS</code>.
      </p>
      <form
        action={async () => {
          "use server";
          await signIn("google", {
            redirectTo: params.callbackUrl || "/admin",
          });
        }}
      >
        <button type="submit" className="btn btn-solid w-full">
          Continue with Google
        </button>
      </form>
    </div>
  );
}
