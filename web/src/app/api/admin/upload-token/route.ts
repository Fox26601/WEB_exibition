import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAdmin } from "@/lib/auth";
import { usingLocalBlobFallback, writeBlobBinary } from "@/lib/blob-store";
import { randomUUID } from "crypto";
import {
  artworkUploadPathname,
  contentTypeForKind,
  maxBytesForKind,
  validateArtworkUpload,
  VIDEO_UPLOAD_CONTENT_TYPES,
  type ArtworkUploadKind,
} from "@/lib/artwork-upload";

function kindFromPathname(pathname: string): ArtworkUploadKind {
  const lower = pathname.toLowerCase();
  if (
    lower.includes("/video/") ||
    /\.(mp4|mov|m4v|webm)$/.test(lower)
  ) {
    return "video";
  }
  if (
    lower.includes("/model/") ||
    lower.endsWith(".glb") ||
    lower.endsWith(".gltf")
  ) {
    return "model";
  }
  return "image";
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
      const kindHint = String(form.get("kind") || "");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "file required" }, { status: 400 });
      }

      const validated = validateArtworkUpload(file);
      if (!validated.ok) {
        const status = validated.error.includes("exceeds") ? 413 : 400;
        return NextResponse.json({ error: validated.error }, { status });
      }

      if (
        kindHint &&
        kindHint !== validated.kind &&
        (kindHint === "image" || kindHint === "video" || kindHint === "model")
      ) {
        return NextResponse.json(
          {
            error: `File looks like ${validated.kind}, not ${kindHint}`,
          },
          { status: 400 },
        );
      }

      const kind = validated.kind;
      const buf = Buffer.from(await file.arrayBuffer());
      const pathname = artworkUploadPathname(kind, validated.ext, randomUUID());
      const contentType =
        file.type || contentTypeForKind(kind, file.name, file.type);
      const written = await writeBlobBinary(pathname, buf, contentType);
      if (!written) {
        return NextResponse.json(
          { error: "Failed to store upload" },
          { status: 503 },
        );
      }
      return NextResponse.json({
        url: written.url,
        pathname,
        kind,
        local: true,
      });
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
        const kind = kindFromPathname(pathname);
        return {
          allowedContentTypes:
            kind === "video"
              ? [...VIDEO_UPLOAD_CONTENT_TYPES]
              : kind === "model"
                ? [
                    "model/gltf-binary",
                    "model/gltf+json",
                    "application/octet-stream",
                  ]
                : ["image/jpeg", "image/png", "image/webp", "image/gif"],
          maximumSizeInBytes: maxBytesForKind(kind),
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
