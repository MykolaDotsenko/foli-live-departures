import { msg, t } from "../../i18n";
import { distanceInMeters, formatDistance, hasCoordinates } from "../../utils/geo";
import { accessibleRouteTextColor, contrastRatio } from "../../utils/routes";
import { dataAgeSeconds } from "../../utils/time";

// What one departure row says about its bus beyond the time: where the
// vehicle is, which name its destination goes by, whether a wheelchair gets
// on, and how its line badge is coloured. Each answers from the row's own
// data, so the board and the line filter draw the same badge for a line.

// Each vehicle has its own phrases: in Finnish a bus and a waterbus stop at
// different places, and their names inflect.
const VEHICLE_PHRASES = {
  bus: {
    atStop: msg("Bus is at the stop"),
    lastPosition: msg("Last bus position ≈{distance} from stop · {minutes} min old"),
    atOrNear: msg("Bus at or near stop"),
    nearby: msg("Bus nearby · ≈{distance} from stop"),
    away: msg("Bus ≈{distance} from stop"),
  },
  waterbus: {
    atStop: msg("Waterbus is at the stop"),
    lastPosition: msg(
      "Last waterbus position ≈{distance} from stop · {minutes} min old"
    ),
    atOrNear: msg("Waterbus at or near stop"),
    nearby: msg("Waterbus nearby · ≈{distance} from stop"),
    away: msg("Waterbus ≈{distance} from stop"),
  },
};

export function vehicleProximity(arrival, stop, route, serverTime) {
  if (!arrival.monitored) return "";

  const phrases = VEHICLE_PHRASES[route?.type === 4 ? "waterbus" : "bus"];
  const ageSeconds = dataAgeSeconds(arrival.recordedattime, serverTime);

  // ETA can still be realtime when the provider omitted the physical sample
  // timestamp, but position/at-stop telemetry of unknown age is not safe to
  // present as current. Ride Mode uses the same freshness boundary.
  if (ageSeconds === null) return "";

  if (arrival.vehicleatstop === true && ageSeconds <= 120) {
    return t(phrases.atStop);
  }

  if (
    !hasCoordinates(stop) ||
    !hasCoordinates({ lat: arrival.latitude, lon: arrival.longitude })
  ) {
    return "";
  }

  const distance = distanceInMeters(
    { lat: arrival.latitude, lon: arrival.longitude },
    stop
  );
  if (!Number.isFinite(distance)) return "";

  if (ageSeconds !== null && ageSeconds > 120) {
    return t(phrases.lastPosition, {
      distance: formatDistance(distance),
      minutes: Math.max(2, Math.round(ageSeconds / 60)),
    });
  }

  if (distance <= 50) return t(phrases.atOrNear);
  if (distance <= 250) {
    return t(phrases.nearby, { distance: formatDistance(distance) });
  }

  return t(phrases.away, { distance: formatDistance(distance) });
}

export function routeBadgeStyle(route) {
  if (!route?.color) return undefined;

  // A route colour close to white (line 1's yellow is 1.07:1 against the
  // row) leaves the badge with no edge, so it gets a hairline outline.
  const blendsIntoRow = (contrastRatio(route.color, "#ffffff") ?? 21) < 1.5;

  return {
    backgroundColor: route.color,
    color: accessibleRouteTextColor(route.color, route.textColor || "#ffffff"),
    ...(blendsIntoRow
      ? { boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.22)" }
      : {}),
  };
}

// The row leads with the name on the bus's own sign, which is the Finnish one.
// A reader whose language Föli also names the destination in gets that name
// beside it, never instead of it: "Harbour" alone gave an English reader
// nothing to match against the "Satama" on the bus pulling in.
export function destinationNames(arrival, preferredLanguages) {
  const sign =
    arrival.destinationdisplay ||
    arrival.destinationdisplay_en ||
    arrival.destinationdisplay_sv ||
    "";
  // Marked, so an English screen reader says "Satama" as a Finn would.
  const signLang = arrival.destinationdisplay
    ? "fi"
    : arrival.destinationdisplay_en
      ? "en"
      : arrival.destinationdisplay_sv
        ? "sv"
        : "";

  for (const language of preferredLanguages) {
    const base = String(language || "").toLowerCase().split("-")[0];
    // The sign is already in a Finnish reader's language.
    if (base === "fi") break;

    const translated =
      base === "sv"
        ? arrival.destinationdisplay_sv
        : base === "en"
          ? arrival.destinationdisplay_en
          : "";
    if (!translated) continue;

    const repeatsSign =
      translated.trim().toLocaleLowerCase() === sign.trim().toLocaleLowerCase();
    return {
      sign,
      signLang,
      translation: repeatsSign ? "" : translated,
      lang: base,
    };
  }

  return { sign, signLang, translation: "", lang: "" };
}

export function wheelchairLabel(value) {
  if (value === 1) return t("Wheelchair accessible");
  if (value === 2) return t("Not wheelchair accessible");
  return "";
}
