import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAdmin } from "@/lib/auth";
import { usingLocalBlobFallback, writeBlobBinary } from "@/lib/blob-store";
import { randomUUID } from "crypto";

const IMAGE_MAX = 8 * 1024 * 1024;
const VIDEO_MAX = 80 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (usingLocalBlobFallback()) {
    const form = await req.formData().catch(() => null);
    if (form) {
      const file = form.get("file");
      const kind = String(form.get("kind") || "image");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "file required" }, { status: 400 });
      }
      const max = kind === "video" ? VIDEO_MAX : IMAGE_MAX;
      if (file.size > max) {
        return NextResponse.json(
          { error: `File exceeds ${kind === "video" ? "80MB" : "8MB"} limit` },
          { status: 413 },
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const ext =
        kind === "video"
          ? "mp4"
          : file.type.includes("png")
            ? "png"
            : file.type.includes("webp")
              ? "webp"
              : "jpg";
      const pathname = `uploads/${kind}/${randomUUID()}.${ext}`;
      const { url } = await writeBlobBinary(
        pathname,
        buf,
        file.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
      );
      return NextResponse.json({ url, pathname, local: true });
    }

    return NextResponse.json({
      local: true,
      message: "Use multipart POST with file + kind for local uploads",
    });
  }

  const body = (await req.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const isVideo =
          pathname.endsWith(".mp4") || pathname.includes("/video/");
        return {
          allowedContentTypes: isVideo
            ? ["video/mp4"]
            : ["image/jpeg", "image/png", "image/webp", "image/gif"],
          maximumSizeInBytes: isVideo ? VIDEO_MAX : IMAGE_MAX,
          tokenPayload: JSON.stringify({ email: session.user?.email }),
        };
      },
      onUploadCompleted: async () => {
        /* metadata saved via artworks API */
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
