/** CSS layout box of the Unity canvas (viewport pixels). */
export type UnityCanvasRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** WebGL backing store size (canvas.width / canvas.height). */
export type UnityCanvasBacking = {
  width: number;
  height: number;
};

export type UnityPointerMap = {
  overCanvas: boolean;
  normU: number;
  normV: number;
  screenX: number;
  screenY: number;
  canvasWidth: number;
  canvasHeight: number;
};

/**
 * Map viewport client coordinates to Unity screen space (bottom-left origin).
 */
export function mapClientToUnityPointer(
  clientX: number,
  clientY: number,
  canvasRect: UnityCanvasRect,
  backing: UnityCanvasBacking,
): UnityPointerMap {
  const overCanvas =
    canvasRect.width > 0 &&
    canvasRect.height > 0 &&
    clientX >= canvasRect.left &&
    clientX <= canvasRect.left + canvasRect.width &&
    clientY >= canvasRect.top &&
    clientY <= canvasRect.top + canvasRect.height;

  const uCss =
    canvasRect.width > 0
      ? (clientX - canvasRect.left) / canvasRect.width
      : 0;
  const vFromTop =
    canvasRect.height > 0
      ? (clientY - canvasRect.top) / canvasRect.height
      : 0;

  const normU = overCanvas ? clamp01(uCss) : 0;
  const normV = overCanvas ? clamp01(1 - vFromTop) : 0;

  const screenX = normU * backing.width;
  const screenY = normV * backing.height;

  return {
    overCanvas,
    normU,
    normV,
    screenX,
    screenY,
    canvasWidth: backing.width,
    canvasHeight: backing.height,
  };
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export function resolveUnityCanvasFromExhibitionIframe(
  exhibitionIframe: HTMLIFrameElement | null,
): HTMLCanvasElement | null {
  if (!exhibitionIframe?.contentDocument) return null;
  const inner = exhibitionIframe.contentDocument.querySelector("iframe");
  if (!inner?.contentDocument) return null;
  return inner.contentDocument.querySelector(
    "#unity-canvas",
  ) as HTMLCanvasElement | null;
}

export function resolveUnityIframeRect(
  exhibitionIframe: HTMLIFrameElement | null,
): { rect: UnityCanvasRect; backing: UnityCanvasBacking } | null {
  if (!exhibitionIframe?.contentDocument) return null;
  const inner = exhibitionIframe.contentDocument.querySelector("iframe");
  if (!inner) return null;
  const rect = inner.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return {
    rect: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    },
    backing: {
      width: Math.max(1, Math.round(rect.width * dpr)),
      height: Math.max(1, Math.round(rect.height * dpr)),
    },
  };
}

export function mapPointerThroughExhibitionIframe(
  clientX: number,
  clientY: number,
  exhibitionIframe: HTMLIFrameElement | null,
): UnityPointerMap | null {
  const canvas = resolveUnityCanvasFromExhibitionIframe(exhibitionIframe);
  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return mapClientToUnityPointer(clientX, clientY, rect, {
      width: canvas.width,
      height: canvas.height,
    });
  }
  const fallback = resolveUnityIframeRect(exhibitionIframe);
  if (!fallback) return null;
  return mapClientToUnityPointer(
    clientX,
    clientY,
    fallback.rect,
    fallback.backing,
  );
}