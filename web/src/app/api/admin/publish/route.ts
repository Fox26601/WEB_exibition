import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { publishDraft } from "@/lib/catalog";

export async function POST() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const catalog = await publishDraft();
  return NextResponse.json({
    catalog,
    dirty: false,
    message: "Catalog published to live site",
  });
}
