/**
 * Cache-bust tag for Unity assets under /public/unity (match index.html ?v= on Build URLs).
 * v034: RoomOverlapClip + wall omission — requires a fresh Mac WebGL export before prod matches C#.
 * Until web/public/unity/Build/* is replaced, only the Next shell changes; wasm is still pre-v034.
 */
export const UNITY_ASSET_CACHE_TAG = "034";

/** Shipped Build/ must be one Unity export; bump tag only with full web/public/unity/Build refresh. */
export const UNITY_PRODUCT_VERSION = "0.3.4-overlap-walls";