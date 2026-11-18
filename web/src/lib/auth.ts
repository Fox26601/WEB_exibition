import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowlistedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = adminEmails();
  if (list.length === 0) return false;
  return list.includes(email.toLowerCase());
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId:
        process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.AUTH_GOOGLE_ID,
      clientSecret:
        process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
        process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: { prompt: "select_account" },
      },
    }),
  ],
  pages: {
    signIn: "/admin/login",
    error: "/admin/forbidden",
  },
  callbacks: {
    async signIn({ user }) {
      if (!isAllowlistedEmail(user.email)) {
        return "/admin/forbidden";
      }
      return true;
    },
    async session({ session }) {
      if (session.user && !isAllowlistedEmail(session.user.email)) {
        return { ...session, user: { ...session.user, email: "" } };
      }
      return session;
    },
  },
  trustHost: true,
});

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email || !isAllowlistedEmail(session.user.email)) {
    return null;
  }
  return session;
}
