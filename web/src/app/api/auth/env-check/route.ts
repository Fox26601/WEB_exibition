import { NextResponse } from "next/server";

/** Names only — helps debug Vercel Auth.js Configuration without exposing secrets. */
export async function GET() {
  return NextResponse.json({
    authSecret: Boolean(process.env.AUTH_SECRET?.trim()),
    googleId: Boolean(process.env.AUTH_GOOGLE_ID?.trim()),
    googleSecret: Boolean(process.env.AUTH_GOOGLE_SECRET?.trim()),
    adminEmails: Boolean(process.env.ADMIN_EMAILS?.trim()),
    authUrl: Boolean(process.env.AUTH_URL?.trim()),
  });
}