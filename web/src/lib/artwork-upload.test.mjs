import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARTWORK_UPLOAD_ACCEPT,
  detectArtworkUploadKind,
  describeUploadLimit,
  extForKind,
  maxBytesForKind,
  validateArtworkUpload,
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  MODEL_MAX_BYTES,
} from "./artwork-upload.ts";

describe("detectArtworkUploadKind", () => {
  it("detects images from MIME and extension", () => {
    assert.equal(detectArtworkUploadKind("wall.jpg", "image/jpeg"), "image");
    assert.equal(detectArtworkUploadKind("wall.PNG", ""), "image");
    assert.equal(detectArtworkUploadKind("a.webp", "image/webp"), "image");
    assert.equal(detectArtworkUploadKind("x.gif", "image/gif"), "image");
  });

  it("detects MP4 video from MIME or extension", () => {
    assert.equal(detectArtworkUploadKind("clip.mp4", "video/mp4"), "video");
    assert.equal(detectArtworkUploadKind("clip.MP4", ""), "video");
    assert.equal(
      detectArtworkUploadKind("mystery.bin", "video/mp4"),
      "video",
    );
  });

  it("detects GLB/GLTF models even with octet-stream MIME", () => {
    assert.equal(
      detectArtworkUploadKind("bust.glb", "application/octet-stream"),
      "model",
    );
    assert.equal(
      detectArtworkUploadKind("bust.gltf", "model/gltf+json"),
      "model",
    );
    assert.equal(
      detectArtworkUploadKind("x.bin", "model/gltf-binary"),
      "model",
    );
  });

  it("rejects unsupported video containers and unknown types", () => {
    assert.equal(detectArtworkUploadKind("clip.webm", "video/webm"), null);
    assert.equal(detectArtworkUploadKind("mesh.obj", ""), null);
    assert.equal(detectArtworkUploadKind("mesh.fbx", "application/octet-stream"), null);
    assert.equal(detectArtworkUploadKind("notes.txt", "text/plain"), null);
  });
});

describe("validateArtworkUpload", () => {
  it("accepts a valid image under the size limit", () => {
    const result = validateArtworkUpload({
      name: "photo.png",
      type: "image/png",
      size: 1024,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.kind, "image");
      assert.equal(result.ext, "png");
      assert.equal(result.contentType, "image/png");
      assert.equal(result.maxBytes, IMAGE_MAX_BYTES);
    }
  });

  it("rejects oversized files with kind-specific messages", () => {
    const image = validateArtworkUpload({
      name: "big.jpg",
      type: "image/jpeg",
      size: IMAGE_MAX_BYTES + 1,
    });
    assert.equal(image.ok, false);
    if (!image.ok) assert.match(image.error, /8MB/);

    const video = validateArtworkUpload({
      name: "big.mp4",
      type: "video/mp4",
      size: VIDEO_MAX_BYTES + 1,
    });
    assert.equal(video.ok, false);
    if (!video.ok) assert.match(video.error, /80MB/);

    const model = validateArtworkUpload({
      name: "big.glb",
      type: "model/gltf-binary",
      size: MODEL_MAX_BYTES + 1,
    });
    assert.equal(model.ok, false);
    if (!model.ok) assert.match(model.error, /40MB/);
  });

  it("accepts GLB/GLTF within the model limit", () => {
    const glb = validateArtworkUpload({
      name: "sculpture.glb",
      type: "",
      size: MODEL_MAX_BYTES,
    });
    assert.equal(glb.ok, true);
    if (glb.ok) {
      assert.equal(glb.kind, "model");
      assert.equal(glb.ext, "glb");
      assert.equal(glb.contentType, "model/gltf-binary");
    }

    const gltf = validateArtworkUpload({
      name: "sculpture.gltf",
      type: "model/gltf+json",
      size: 100,
    });
    assert.equal(gltf.ok, true);
    if (gltf.ok) {
      assert.equal(gltf.kind, "model");
      assert.equal(gltf.ext, "gltf");
      assert.equal(gltf.contentType, "model/gltf+json");
    }
  });

  it("rejects unsupported formats with a clear error", () => {
    const result = validateArtworkUpload({
      name: "mesh.obj",
      type: "",
      size: 10,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Unsupported/);
  });
});

describe("artwork upload helpers", () => {
  it("exposes accept list covering image, video, and 3D", () => {
    assert.match(ARTWORK_UPLOAD_ACCEPT, /image\/jpeg/);
    assert.match(ARTWORK_UPLOAD_ACCEPT, /video\/mp4/);
    assert.match(ARTWORK_UPLOAD_ACCEPT, /\.glb/);
    assert.match(ARTWORK_UPLOAD_ACCEPT, /\.gltf/);
  });

  it("maps kind to size limits and extensions", () => {
    assert.equal(maxBytesForKind("image"), IMAGE_MAX_BYTES);
    assert.equal(maxBytesForKind("video"), VIDEO_MAX_BYTES);
    assert.equal(maxBytesForKind("model"), MODEL_MAX_BYTES);
    assert.equal(describeUploadLimit("model"), "40MB");
    assert.equal(extForKind("model", "a.gltf", ""), "gltf");
    assert.equal(extForKind("video", "a.mp4", ""), "mp4");
  });
});
