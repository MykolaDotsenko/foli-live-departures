import { describe, expect, it, vi } from "vitest";
import {
  createNativeActiveRideBridge,
  nativeRideCompanionEligible,
} from "./nativeActiveRide";

function session(overrides = {}) {
  return {
    id: "ride-1",
    expiresAt: Date.now() + 60_000,
    options: {
      locationBackup: true,
      notifications: false,
      nativeForeground: true,
    },
    ...overrides,
  };
}

describe("nativeRideCompanionEligible", () => {
  it("waits for a real GPS fix and explicit Ride Mode options", () => {
    expect(nativeRideCompanionEligible(session(), { status: "starting" })).toBe(false);
    expect(nativeRideCompanionEligible(session(), { status: "active" })).toBe(true);
    expect(nativeRideCompanionEligible(session(), { status: "weak" })).toBe(true);
    expect(nativeRideCompanionEligible(session(), { status: "off-route" })).toBe(true);
    expect(
      nativeRideCompanionEligible(
        session({ options: { locationBackup: true, nativeForeground: false } }),
        { status: "active" },
      ),
    ).toBe(false);
    expect(
      nativeRideCompanionEligible(
        session({ options: { locationBackup: true } }),
        { status: "active" },
      ),
    ).toBe(false);
    expect(
      nativeRideCompanionEligible(
        session({ options: { locationBackup: false, notifications: true } }),
        { status: "active" },
      ),
    ).toBe(false);
    expect(
      nativeRideCompanionEligible(
        session({
          options: {
            locationBackup: true,
            notifications: false,
            nativeForeground: true,
          },
        }),
        { status: "active" },
      ),
    ).toBe(true);
  });
});

describe("createNativeActiveRideBridge", () => {
  it("is a no-op outside the packaged Android build", async () => {
    const bridge = createNativeActiveRideBridge({
      capacitor: null,
      nativeBuild: false,
    });
    expect(bridge.supported()).toBe(false);
    await expect(bridge.start(session())).resolves.toMatchObject({
      active: false,
      reason: "unsupported",
    });
  });

  it("passes only opaque id and expiry to the registered native plugin", async () => {
    const prepare = vi.fn(async ({ request }) => ({
      ready: request === true,
      reason: request ? "ready" : "notification-permission-required",
    }));
    const start = vi.fn(async (payload) => ({
      active: false,
      reason: "requested",
      rideId: payload.rideId,
    }));
    const stop = vi.fn(async () => ({ active: false, reason: "stopping" }));
    const status = vi.fn(async () => ({
      active: true,
      rideId: "ride-1",
      serviceType: "location",
      restartPolicy: "not-sticky",
    }));
    const bridge = createNativeActiveRideBridge({
      nativeBuild: true,
      capacitor: {
        getPlatform: () => "android",
        isNativePlatform: () => true,
        isPluginAvailable: (name) => name === "ActiveRide",
        Plugins: { ActiveRide: { prepare, start, stop, status } },
      },
    });

    const fullSession = session({
      targetStop: { id: "32", name: "Private destination" },
      plan: { secret: "not-native" },
    });
    await expect(bridge.prepare({ request: false })).resolves.toEqual({
      ready: false,
      reason: "notification-permission-required",
    });
    await expect(bridge.prepare({ request: true })).resolves.toEqual({
      ready: true,
      reason: "ready",
    });
    expect(prepare).toHaveBeenNthCalledWith(1, { request: false });
    expect(prepare).toHaveBeenNthCalledWith(2, { request: true });

    const started = await bridge.start(fullSession);

    expect(started).toMatchObject({ requested: true, rideId: "ride-1" });
    expect(start).toHaveBeenCalledWith({
      rideId: "ride-1",
      expiresAt: String(Math.trunc(fullSession.expiresAt)),
    });
    expect(JSON.stringify(start.mock.calls[0][0])).not.toContain("destination");
    expect(JSON.stringify(start.mock.calls[0][0])).not.toContain("secret");
    await expect(bridge.status()).resolves.toMatchObject({
      active: true,
      serviceType: "location",
      restartPolicy: "not-sticky",
    });
    await bridge.stop("ride-1");
    expect(stop).toHaveBeenCalledWith({ rideId: "ride-1" });
  });
});
