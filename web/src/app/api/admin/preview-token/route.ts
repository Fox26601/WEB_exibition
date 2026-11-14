import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { signPreviewToken } from "@/lib/preview-token";

export async function POST() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const token = await signPreviewToken("2h");
  return NextResponse.json({ token });
}
