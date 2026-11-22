import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PRESENCE_ID_COOKIE } from "./constants";

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days — keep FIFO place across refresh

export function readPresenceId(req: NextRequest): string | null {
  const fromCookie = req.cookies.get(PRESENCE_ID_COOKIE)?.value?.trim();
  if (fromCookie && fromCookie.length >= 8 && fromCookie.length <= 80) {
    return fromCookie;
  }
  return null;
}

export function ensurePresenceId(req: NextRequest): {
  id: string;
  isNew: boolean;
} {
  const existing = readPresenceId(req);
  if (existing) return { id: existing, isNew: false };
  return { id: randomUUID(), isNew: true };
}

export function attachPresenceCookie(
  res: NextResponse,
  id: string,
  isNew: boolean,
): NextResponse {
  if (!isNew) return res;
  res.cookies.set({
    name: PRESENCE_ID_COOKIE,
    value: id,
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SEC,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

export function jsonWithPresenceCookie(
  body: unknown,
  id: string,
  isNew: boolean,
  init?: ResponseInit,
): NextResponse {
  const res = NextResponse.json(body, init);
  return attachPresenceCookie(res, id, isNew);
}
