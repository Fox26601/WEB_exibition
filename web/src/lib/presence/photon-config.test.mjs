import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getPhotonServerConfig,
  toPresenceConfigResponse,
} from "./photon-config.ts";

const KEYS = ["PHOTON_APP_ID", "PHOTON_REGION"];

function clearPhotonEnv() {
  for (const key of KEYS) delete process.env[key];
}

afterEach(() => {
  clearPhotonEnv();
});

describe("getPhotonServerConfig / toPresenceConfigResponse", () => {
  it("returns disabled when PHOTON_APP_ID is missing", () => {
    clearPhotonEnv();
    assert.equal(getPhotonServerConfig(), null);
    assert.deepEqual(toPresenceConfigResponse(null), { disabled: true });
  });

  it("returns appId and default region eu", () => {
    clearPhotonEnv();
    process.env.PHOTON_APP_ID = "  test-app-id  ";
    const config = getPhotonServerConfig();
    assert.deepEqual(config, { appId: "test-app-id", region: "eu" });
    assert.deepEqual(toPresenceConfigResponse(config), {
      appId: "test-app-id",
      region: "eu",
    });
  });

  it("honours PHOTON_REGION (lowercased)", () => {
    clearPhotonEnv();
    process.env.PHOTON_APP_ID = "app";
    process.env.PHOTON_REGION = " US ";
    assert.deepEqual(getPhotonServerConfig(), {
      appId: "app",
      region: "us",
    });
  });
});
