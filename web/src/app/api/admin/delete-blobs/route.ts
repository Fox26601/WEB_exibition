import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { blobPathnameFromUrl } from "@/lib/blob-pathname";
import { deleteBlob } from "@/lib/blob-store";

const schema = z.object({
  urls: z.array(z.string()).max(40),
});

/** Only media upload keys — never catalog JSON or other store roots. */
function isDeletableMediaPath(pathname: string): boolean {
  return (
    pathname.startsWith("uploads/") ||
    pathname.startsWith("artworks/")
  );
}

/**
 * Best-effort delete of media blobs uploaded during an edit session that was
 * cancelled before Save. Used by admin artwork editors.
 */
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const pathnames = new Set<string>();
  for (const url of parsed.data.urls) {
    const path = blobPathnameFromUrl(url);
    if (path && isDeletableMediaPath(path)) pathnames.add(path);
  }

  let deleted = 0;
  for (const pathname of pathnames) {
    try {
      await deleteBlob(pathname);
      deleted += 1;
    } catch {
      /* best-effort */
    }
  }

  return NextResponse.json({ ok: true, deleted });
}
