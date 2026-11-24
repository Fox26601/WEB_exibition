import * as THREE from "three";
import { resolveGalleryMediaUrl } from "./texture-load";

export type WallVideoHandle = {
  texture: THREE.VideoTexture;
  video: HTMLVideoElement;
  dispose: () => void;
};

function isCrossOriginUrl(resolved: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const u = new URL(resolved, window.location.href);
    return u.origin !== window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Muted looping VideoTexture for wall canvases (iOS Safari: muted + playsInline).
 * Returns null when URL is empty or document is unavailable (SSR).
 */
export function createWallVideoTexture(url: string): WallVideoHandle | null {
  if (typeof document === "undefined") return null;
  const resolved = resolveGalleryMediaUrl(url);
  if (!resolved) return null;

  const video = document.createElement("video");
  video.muted = true;
  video.defaultMuted = true;
  video.volume = 0;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.loop = true;
  video.preload = "auto";
  video.disablePictureInPicture = true;
  if (isCrossOriginUrl(resolved)) {
    video.crossOrigin = "anonymous";
  }
  video.src = resolved;

  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const tryPlay = () => {
    void video.play().catch(() => {
      /* muted autoplay usually succeeds; retry on canplay */
    });
  };

  video.addEventListener("loadeddata", tryPlay);
  video.addEventListener("canplay", tryPlay);
  tryPlay();

  return {
    texture,
    video,
    dispose: () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
      texture.dispose();
    },
  };
}

/** True once the element has at least one decoded frame (HAVE_CURRENT_DATA). */
export function wallVideoHasFrame(video: Pick<HTMLVideoElement, "readyState">): boolean {
  return video.readyState >= 2;
}
