"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/artworks", label: "Artworks" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/preview", label: "Preview" },
];

export function AdminNav({ email }: { email?: string | null }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-[var(--line)] bg-[#161310]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
        <div className="flex flex-wrap items-center gap-5">
          <Link
            href="/admin"
            className="font-[family-name:var(--font-display)] text-lg font-bold"
          >
            Atelier Admin
          </Link>
          <nav className="flex flex-wrap gap-3 text-sm">
            {LINKS.map((link) => {
              const active =
                link.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={
                    active
                      ? "text-[var(--amber-bright)]"
                      : "text-[var(--paper-dim)] hover:text-[var(--paper)]"
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-[var(--paper-dim)]">
          <span className="hidden sm:inline">{email}</span>
          <button
            type="button"
            className="btn btn-ghost !py-1.5 !px-3 !text-[0.7rem]"
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
