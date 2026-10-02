/**
 * Native foreground support is deliberately subordinate to Ride Mode:
 * it never decides stages, stores GPS, or persists a second copy of the ride.
 * Android receives only an opaque ride id and an expiry bound.
 */

const READY_GPS_STATES = new Set(["active", "weak", "off-route"]);

/**
 * @param {any} session
 * @param {any} gps
 */
export function nativeRideCompanionEligible(session, gps) {
  return Boolean(
    session?.id &&
      session?.options?.locationBackup === true &&
      session?.options?.notifications !== false &&
      READY_GPS_STATES.has(String(gps?.status || "")),
  );
}

/**
 * @param {{capacitor?: any, nativeBuild?: boolean}} [options]
 */
export function createNativeActiveRideBridge(options = {}) {
  const capacitor =
    options.capacitor ?? /** @type {any} */ (globalThis).Capacitor ?? null;
  const nativeBuild =
    options.nativeBuild ??
    (String(import.meta.env.VITE_NATIVE_BUILD || "") === "true");
  let plugin = null;

  function resolvePlugin() {
    if (!nativeBuild || !capacitor) return null;
    if (capacitor.getPlatform?.() !== "android") return null;
    if (capacitor.isNativePlatform?.() !== true) return null;
    if (capacitor.isPluginAvailable?.("ActiveRide") !== true) return null;
    if (typeof capacitor.registerPlugin !== "function") return null;
    plugin ||= capacitor.registerPlugin("ActiveRide");
    return plugin;
  }

  /**
   * @param {"start" | "stop" | "status"} method
   * @param {Record<string, string>} [payload]
   */
  async function safeCall(method, payload = {}) {
    const target = resolvePlugin();
    if (!target || typeof target[method] !== "function") {
      return { active: false, requested: false, reason: "unsupported", rideId: "" };
    }
    try {
      const result = await target[method](payload);
      return {
        active: result?.active === true,
        requested: result?.reason === "requested",
        reason: String(result?.reason || ""),
        rideId: String(result?.rideId || ""),
        expiresAt: String(result?.expiresAt || ""),
        serviceType: String(result?.serviceType || ""),
        restartPolicy: String(result?.restartPolicy || ""),
        lastFailure: String(result?.lastFailure || ""),
      };
    } catch {
      return {
        active: false,
        requested: false,
        reason: "native-call-failed",
        rideId: "",
      };
    }
  }

  return {
    supported: () => resolvePlugin() !== null,
    /**
     * @param {{id?: unknown, expiresAt?: unknown}} session
     */
    start(session) {
      const rideId = String(session?.id || "").trim().slice(0, 128);
      const expiresAt = Number(session?.expiresAt);
      if (!rideId || !Number.isFinite(expiresAt)) {
        return Promise.resolve({
          active: false,
          requested: false,
          reason: "invalid-ride",
          rideId: "",
        });
      }
      return safeCall("start", {
        rideId,
        expiresAt: String(Math.trunc(expiresAt)),
      });
    },
    /** @param {string} rideId */
    stop(rideId) {
      return safeCall("stop", {
        rideId: String(rideId || "").trim().slice(0, 128),
      });
    },
    status() {
      return safeCall("status");
    },
  };
}

export const nativeActiveRideBridge = createNativeActiveRideBridge();
