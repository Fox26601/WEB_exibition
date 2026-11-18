import * as THREE from "three";
import { SKY_PANORAMA_URL } from "./constants";

export function loadNightSky(
  loader: THREE.TextureLoader,
  onLoaded: (tex: THREE.Texture) => void,
  onError?: () => void,
): void {
  loader.load(
    SKY_PANORAMA_URL,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.mapping = THREE.EquirectangularReflectionMapping;
      onLoaded(tex);
    },
    undefined,
    onError,
  );
}

export function applySkyToScene(
  scene: THREE.Scene,
  tex: THREE.Texture,
  previewLite: boolean,
): void {
  scene.background = tex;
  if (!previewLite) {
    scene.fog = new THREE.Fog(0x120818, 12, 48);
  }
}