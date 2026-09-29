// The service alerts a stop board shows, as src/utils/alerts.js builds them
// from Föli's ALERTS document. Föli's own document is raw JSON (RawRecord in
// src/api/foliApi.js); these describe what the board and Ride Mode consume.

import type { EpochSeconds, Route } from "./foli";

/** A notice Föli wrote: an emergency, its network-wide notice, or one message. */
export type StopNoticeType = "emergency" | "global" | "message";

export type StopAlertType = StopNoticeType | "cancellation";

/** One of a notice's images, only ever over https. */
export interface AlertImage {
  url: string;
  title: string;
  type: string;
}

/** The validity period that applies now, or the next one, or the first. */
export interface AlertValidity {
  start: EpochSeconds | null;
  end: EpochSeconds | null;
}

interface StopAlertBase {
  id: string;
  /** Lower sorts first: emergency, then global, cancellations, messages. */
  priority: number;
  title: string;
  message: string;
  information: string;
  /** Föli's effect code, such as "DETOUR"; "" when it gives none. */
  effect: string;
  /** The effect in the interface's language. */
  effectLabel: string;
  /** Föli's cause code; "" when it gives none. */
  cause: string;
  /** Public line numbers the alert concerns. */
  routeNames: string[];
}

/** A notice built from one of Föli's structured messages. */
export interface StopNotice extends StopAlertBase {
  type: StopNoticeType;
  icon: string;
  /** At most four. */
  images: AlertImage[];
  validity: AlertValidity | null;
}

/** An emergency or global notice Föli sent as bare text. */
export interface TextStopNotice extends StopAlertBase {
  type: "emergency" | "global";
  information: "";
  effect: "";
  cause: "";
  icon: "";
  images?: undefined;
  validity?: undefined;
}

/** One cancelled departure at this stop. */
export interface CancellationAlert extends StopAlertBase {
  type: "cancellation";
  message: "";
  information: "";
  effect: "NO_SERVICE";
  /** The public line; "" when Föli does not say. */
  line: string;
  /** The cancelled arrival at this stop. */
  scheduledTime: EpochSeconds | null;
  /** The cancelled run's departure from its origin (SIRI originaimeddeparturetime). */
  originDepartureTime: EpochSeconds | null;
  icon?: undefined;
  images?: undefined;
  validity?: undefined;
}

export type StopAlert = StopNotice | TextStopNotice | CancellationAlert;

/** What decides which of Föli's alerts concern a stop. */
export interface StopAlertContext {
  stopId?: string;
  /** Public line numbers on the board. */
  lineRefs?: readonly string[];
  routesById?: ReadonlyMap<string, Pick<Route, "shortName">>;
  /** Language tags for Föli's translations, most wanted first. */
  preferredLanguages?: readonly string[];
  /** Föli route ids that serve the stop. */
  servedRouteIds?: Set<string> | Iterable<string>;
}
