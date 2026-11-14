import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { isAllowlistedEmail } from "@/lib/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin/login") || pathname.startsWith("/admin/forbidden")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    const email = req.auth?.user?.email;
    if (!email || !isAllowlistedEmail(email)) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*"],
};
