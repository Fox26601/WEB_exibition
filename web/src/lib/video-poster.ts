/**
 * Capture an early video frame as a WebP/JPEG blob for urlPoster.
 * Best-effort — returns null if decode / canvas encode fails.
 */
export async function generateVideoPosterBlob(
  file: File,
): Promise<Blob | null> {
  if (typeof window === "undefined") return null;

  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      const onError = () => reject(new Error("video load failed"));
      video.addEventListener("loadeddata", () => resolve(), { once: true });
      video.addEventListener("error", onError, { once: true });
    });

    // Seek slightly past 0 so first-frame black is less common.
    const target = Math.min(0.1, (video.duration || 1) * 0.05);
    if (Number.isFinite(target) && target > 0) {
      await new Promise<void>((resolve) => {
        const onSeeked = () => resolve();
        video.addEventListener("seeked", onSeeked, { once: true });
        try {
          video.currentTime = target;
        } catch {
          resolve();
        }
      });
    }

    const w = video.videoWidth || 320;
    const h = video.videoHeight || 180;
    if (w < 2 || h < 2) return null;

    const canvas = document.createElement("canvas");
    const max = 512;
    const scale = Math.min(1, max / Math.max(w, h));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        (b) => resolve(b),
        "image/webp",
        0.85,
      );
    });
    return blob;
  } catch (err) {
    console.warn("[video-poster] generate failed", err);
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
