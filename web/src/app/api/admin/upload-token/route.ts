import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAdmin } from "@/lib/auth";
import { usingLocalBlobFallback, writeBlobBinary } from "@/lib/blob-store";
import { randomUUID } from "crypto";

const IMAGE_MAX = 8 * 1024 * 1024;
const VIDEO_MAX = 80 * 1024 * 1024;
const MODEL_MAX = 40 * 1024 * 1024;

function maxForKind(kind: string): number {
  if (kind === "video") return VIDEO_MAX;
  if (kind === "model") return MODEL_MAX;
  return IMAGE_MAX;
}

function extFor(kind: string, type: string, name: string): string {
  if (kind === "video") return "mp4";
  if (kind === "model") {
    if (name.endsWith(".gltf") || type.includes("gltf+json")) return "gltf";
    return "glb";
  }
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  return "jpg";
}

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
      const max = maxForKind(kind);
      if (file.size > max) {
        return NextResponse.json(
          {
            error: `File exceeds ${
              kind === "video" ? "80MB" : kind === "model" ? "40MB" : "8MB"
            } limit`,
          },
          { status: 413 },
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const ext = extFor(kind, file.type, file.name || "");
      const pathname = `uploads/${kind}/${randomUUID()}.${ext}`;
      const contentType =
        file.type ||
        (kind === "video"
          ? "video/mp4"
          : kind === "model"
            ? "model/gltf-binary"
            : "image/jpeg");
      const { url } = await writeBlobBinary(pathname, buf, contentType);
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
        const isModel =
          pathname.endsWith(".glb") ||
          pathname.endsWith(".gltf") ||
          pathname.includes("/model/");
        return {
          allowedContentTypes: isVideo
            ? ["video/mp4"]
            : isModel
              ? [
                  "model/gltf-binary",
                  "model/gltf+json",
                  "application/octet-stream",
                ]
              : ["image/jpeg", "image/png", "image/webp", "image/gif"],
          maximumSizeInBytes: isVideo
            ? VIDEO_MAX
            : isModel
              ? MODEL_MAX
              : IMAGE_MAX,
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
