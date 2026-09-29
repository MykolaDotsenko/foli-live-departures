import { t } from "../i18n";

/**
 * @import { RawRecord } from "../api/foliApi"
 * @import { Route } from "../types/foli"
 * @import {
 *   AlertImage,
 *   AlertValidity,
 *   CancellationAlert,
 *   StopAlert,
 *   StopAlertContext,
 *   StopNotice,
 *   StopNoticeType,
 *   TextStopNotice,
 * } from "../types/alerts"
 */

/** @typedef {ReadonlyMap<string, Pick<Route, "shortName">>} RoutesById */

/**
 * Föli's arrays hold records or bare ids; either way an item is read
 * defensively, like the rest of its JSON.
 * @param {unknown} value
 * @returns {RawRecord[]}
 */
function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @param {RawRecord} message
 * @param {number} index
 * @param {string} prefix
 * @returns {string}
 */
function messageId(message, index, prefix) {
  return `${prefix}-${message?.message_id ?? message?.id ?? index}`;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeLanguage(value) {
  return String(value || "").trim().toLowerCase().replaceAll("_", "-");
}

/**
 * @param {RawRecord} message
 * @param {readonly string[]} [preferredLanguages]
 * @returns {RawRecord | null}
 */
function translationFor(message, preferredLanguages = []) {
  const translations =
    message?.translations && typeof message.translations === "object"
      ? message.translations
      : null;
  if (!translations) return null;

  const entries = Object.entries(translations).filter(
    ([, value]) => value && typeof value === "object"
  );

  for (const requested of preferredLanguages) {
    const normalized = normalizeLanguage(requested);
    if (!normalized) continue;

    const exact = entries.find(
      ([key]) => normalizeLanguage(key) === normalized
    );
    if (exact) return exact[1];

    const base = normalized.split("-")[0];
    const sameLanguage = entries.find(([key]) => {
      const candidate = normalizeLanguage(key);
      return candidate === base || candidate.startsWith(`${base}-`);
    });
    if (sameLanguage) return sameLanguage[1];

    // Föli's own text is Finnish, and it only translates it. A Finnish
    // reader gets that original, not the next language the phone lists:
    // Chrome on Android lists English after Finnish.
    if (base === "fi") return null;
  }

  return null;
}

/**
 * @param {RawRecord} message
 * @param {readonly string[]} [preferredLanguages]
 * @returns {{ header: string, message: string, information: string }}
 */
function localizedFields(message, preferredLanguages) {
  const translation = translationFor(message, preferredLanguages);

  return {
    header: text(translation?.header) || text(message?.header),
    message: text(translation?.message) || text(message?.message),
    information:
      text(translation?.information) || text(message?.information),
  };
}

/**
 * @param {RawRecord} message
 * @param {RoutesById} routesById
 * @returns {string[]}
 */
function routeNamesFor(message, routesById) {
  return asArray(message?.affected_routes)
    .map((routeId) => routesById.get(String(routeId))?.shortName)
    .filter(/** @returns {name is string} */ (name) => Boolean(name));
}

/**
 * @param {RawRecord} message
 * @param {string | undefined} stopId
 * @param {ReadonlySet<string>} activeLines
 * @param {RoutesById} routesById
 * @param {ReadonlySet<string>} servedRouteIds
 * @returns {boolean}
 */
function messageMatchesContext(
  message,
  stopId,
  activeLines,
  routesById,
  servedRouteIds
) {
  const stopMatch = asArray(message?.affected_stops).some(
    (affectedStop) => String(affectedStop) === String(stopId)
  );

  if (stopMatch) return true;

  const routeIds = asArray(message?.affected_routes).map(String);
  if (routeIds.some((routeId) => servedRouteIds.has(routeId))) return true;

  const routeNames = routeNamesFor(message, routesById);
  return routeNames.some((line) => activeLines.has(line));
}

// The app's own words for what Föli's codes mean, in the current language.
// Alerts are extracted again whenever the language changes (useStopAlerts).
/**
 * @param {string} effect
 * @returns {string}
 */
function effectLabel(effect) {
  switch (effect) {
    case "NO_SERVICE":
      return t("No service");
    case "REDUCED_SERVICE":
      return t("Reduced service");
    case "SIGNIFICANT_DELAYS":
      return t("Significant delays");
    case "DETOUR":
      return t("Detour");
    case "ADDITIONAL_SERVICE":
      return t("Additional service");
    case "MODIFIED_SERVICE":
      return t("Modified service");
    case "STOP_MOVED":
      return t("Stop moved");
    default:
      return t("Service update");
  }
}


/**
 * @param {unknown} value
 * @returns {string}
 */
function safeImageUrl(value) {
  const raw = text(value);
  if (!raw) return "";

  if (raw.startsWith("//")) return `https:${raw}`;
  if (/^https:\/\/[^\s]+$/i.test(raw)) return raw;

  return "";
}

/**
 * @param {unknown} value
 * @returns {AlertImage[]}
 */
function normalizeImages(value) {
  return asArray(value)
    .map((image) => ({
      url: safeImageUrl(image?.url),
      title: text(image?.title),
      type: text(image?.type),
    }))
    .filter((image) => image.url)
    .slice(0, 4);
}

/**
 * @param {unknown} repeat
 * @param {number | null} [referenceTime]
 * @returns {AlertValidity | null}
 */
function normalizeValidity(repeat, referenceTime) {
  const periods = asArray(repeat)
    .map((period) => {
      if (!Array.isArray(period) || period.length < 2) return null;
      const start = Number(period[0]);
      const end = Number(period[1]);
      return {
        start: Number.isFinite(start) && start > 0 ? start : null,
        end: Number.isFinite(end) && end > 0 ? end : null,
      };
    })
    .filter(
      /** @returns {period is AlertValidity} */ (period) => Boolean(period)
    );

  if (periods.length === 0) return null;

  // Number(null) is 0: a document without servertime must fall back to the
  // clock, not to 1970, or every period looks like it has yet to begin.
  const reference = Number(referenceTime);
  const now =
    Number.isFinite(reference) && reference > 0
      ? reference
      : Math.floor(Date.now() / 1000);

  return (
    periods.find(
      ({ start, end }) =>
        (start === null || start <= now) && (end === null || end >= now)
    ) ||
    periods.find(({ start }) => start !== null && start > now) ||
    periods[0]
  );
}

/**
 * @param {RawRecord} message
 * @param {number} index
 * @param {StopNoticeType} type
 * @param {RoutesById} routesById
 * @param {readonly string[]} [preferredLanguages]
 * @param {number | null} [referenceTime]
 * @returns {StopNotice}
 */
function normalizeMessage(
  message,
  index,
  type,
  routesById,
  preferredLanguages = [],
  referenceTime = null
) {
  const routeNames = routeNamesFor(message, routesById);
  const effect = text(message?.effect);
  const localized = localizedFields(message, preferredLanguages);
  const validity = normalizeValidity(message?.repeat, referenceTime);

  return {
    id: messageId(message, index, type),
    type,
    priority: Number.isFinite(Number(message?.priority))
      ? Number(message.priority)
      : type === "global"
        ? 0
        : 9999,
    title:
      localized.header ||
      (type === "global" ? t("Föli service notice") : effectLabel(effect)),
    message: localized.message,
    information: localized.information,
    effect,
    effectLabel: effectLabel(effect),
    cause: text(message?.cause),
    icon: text(message?.icon),
    routeNames,
    images: normalizeImages(message?.images),
    validity,
  };
}

/**
 * @param {RawRecord | string | null | undefined} value Föli's text, or a
 *   message record.
 * @param {"emergency" | "global"} type
 * @param {string} fallbackTitle
 * @param {readonly string[]} [preferredLanguages]
 * @param {number | null} [referenceTime]
 * @returns {StopNotice | TextStopNotice | null}
 */
function normalizeSpecial(
  value,
  type,
  fallbackTitle,
  preferredLanguages = [],
  referenceTime = null
) {
  if (!value) return null;

  if (typeof value === "string") {
    const message = value.trim();
    return message
      ? {
          id: type,
          type,
          priority: type === "emergency" ? -1000 : -100,
          title: fallbackTitle,
          message,
          information: "",
          effect: "",
          effectLabel: fallbackTitle,
          cause: "",
          icon: "",
          routeNames: [],
        }
      : null;
  }

  if (Array.isArray(value) || typeof value !== "object") return null;

  const hasContent = [
    value.header,
    value.message,
    value.information,
    value.effect,
    value.cause,
  ].some((field) => text(field));

  if (!hasContent) return null;

  const normalized = normalizeMessage(
    value,
    0,
    type,
    new Map(),
    preferredLanguages,
    referenceTime
  );

  return {
    ...normalized,
    id: type,
    priority: type === "emergency" ? -1000 : -100,
    title:
      localizedFields(value, preferredLanguages).header || fallbackTitle,
  };
}

/**
 * @param {RawRecord | null | undefined} payload Föli's ALERTS document.
 * @param {StopAlertContext} [context]
 * @returns {StopAlert[]}
 */
export function extractStopAlerts(
  payload,
  {
    stopId,
    lineRefs = [],
    routesById = new Map(),
    preferredLanguages = [],
    servedRouteIds = new Set(),
  } = {}
) {
  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return [];
  }

  const referenceTime = Number(payload.servertime) || null;
  const routeMembership =
    servedRouteIds instanceof Set ? servedRouteIds : new Set(servedRouteIds);

  /** @type {CancellationAlert[]} */
  const cancellations = asArray(payload.cancellations).flatMap(
    (cancellation, cancellationIndex) => {
      const matchingStops = asArray(cancellation?.stops).filter(
        (stop) =>
          stop?.isactive === true &&
          String(stop.stop) === String(stopId)
      );

      return matchingStops.map((stop, stopIndex) => ({
        id: `cancellation-${cancellation.id ?? cancellationIndex}-${stopIndex}`,
        type: "cancellation",
        priority: -500,
        title: t("Cancelled departure"),
        line:
          cancellation?.line === null || cancellation?.line === undefined
            ? ""
            : String(cancellation.line),
        cause: text(cancellation?.cause),
        scheduledTime: Number.isFinite(Number(stop.arrival))
          ? Number(stop.arrival)
          : null,
        // ALERTS identifies the cancelled run by its departure from the trip
        // origin. SIRI exposes the same planned identity as
        // originaimeddeparturetime. Keeping it prevents two close departures
        // of the same public line from both inheriting one cancellation.
        originDepartureTime:
          Number.isFinite(Number(cancellation?.departure)) &&
          Number(cancellation.departure) > 0
            ? Number(cancellation.departure)
            : null,
        routeNames: cancellation?.line ? [String(cancellation.line)] : [],
        message: "",
        information: "",
        effect: "NO_SERVICE",
        effectLabel: t("No service"),
      }));
    }
  );

  const emergency = normalizeSpecial(
    payload.emergency_message,
    "emergency",
    t("Emergency service notice"),
    preferredLanguages,
    referenceTime
  );

  // An emergency notice replaces Föli's ordinary notices, but a cancelled
  // departure is not a notice: it is what the board shows on the bus's row.
  // Dropped with the rest, a cancelled 32 kept its countdown and its
  // "Get-off alert" through a storm warning.
  if (emergency) return [emergency, ...cancellations];

  const activeLines = new Set(lineRefs.map(String));

  const globalMessage = normalizeSpecial(
    payload.global_message,
    "global",
    t("Föli service notice"),
    preferredLanguages,
    referenceTime
  );

  const messages = asArray(payload.messages)
    .filter(
      (message) =>
        message?.isactive === true &&
        messageMatchesContext(
          message,
          stopId,
          activeLines,
          routesById,
          routeMembership
        )
    )
    .map((message, index) =>
      normalizeMessage(
        message,
        index,
        "message",
        routesById,
        preferredLanguages,
        referenceTime
      )
    );

  return [globalMessage, ...cancellations, ...messages]
    .filter(/** @returns {alert is StopAlert} */ (alert) => Boolean(alert))
    .sort((a, b) => a.priority - b.priority);
}
