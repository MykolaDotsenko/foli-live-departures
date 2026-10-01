// Shapes Ride Mode works with: the plan built when a ride starts, the trip's
// shape prepared for map matching, the evidence the hooks gather while the
// passenger rides, and the stage decisions made from it. A plan is saved
// with the ride and read back after a reload, which is why the functions
// that take one still read it defensively.

import type { Arrival, EpochSeconds, GtfsClock, LatLon, StopSummary } from "./foli";

// ---------------------------------------------------------------------------
// Stages

/** The values of RIDE_STAGE, in the order a ride moves through them. */
export type RideStage = "boarded" | "soon" | "next" | "now" | "missed";

/** Which kind of evidence a stage decision rests on. */
export type RideConfidence = "live" | "location" | "schedule";

/** Why evaluateRideStage() chose its stage. */
export type RideStageReason =
  | "already-missed"
  | "target-passed"
  | "gps-route-passed"
  | "device-moved-away"
  | "target-at-stop"
  | "provider-near-target"
  | "gps-route-arrival"
  | "device-near-target"
  | "previous-stop-passed"
  | "gps-route-distance"
  | "gps-route-eta"
  | "live-eta"
  | "planned-stop-count"
  | "schedule-fallback"
  | "tracking"
  | "monotonic-hold";

export interface RideStageDecision {
  stage: RideStage;
  reason: RideStageReason;
  confidence: RideConfidence;
}

/**
 * Everything the stage logic weighs. Every field is optional: a missing
 * number or `null` means "no evidence", never zero.
 */
export interface RideSignals {
  /** Seconds until the tracked bus reaches the exit, from the live feed. */
  liveEtaSec?: number | null;
  /** Seconds until the planned arrival at the exit, from the timetable. */
  scheduleEtaSec?: number | null;
  /** Planned stops still ahead, up to and including the exit. */
  remainingStops?: number | null;
  /** Straight-line distance from the bus's reported position to the exit. */
  providerDistanceM?: number | null;
  providerPositionAgeSec?: number | null;
  /** Straight-line distance from the phone to the exit. */
  gpsDistanceM?: number | null;
  gpsAccuracyM?: number | null;
  gpsAgeSec?: number | null;
  gpsSpeedMps?: number | null;
  /** The trip's shape is loaded, so straight-line distance is not evidence. */
  gpsShapeAvailable?: boolean;
  /** The latest fix could be matched onto the shape. */
  gpsShapeUsable?: boolean;
  gpsOnRoute?: boolean;
  /** Metres along the route from the phone to the exit; negative once past it. */
  gpsRouteDistanceM?: number | null;
  gpsRouteEtaSec?: number | null;
  gpsPassedTarget?: boolean;
  gpsMovedAwayAfterNear?: boolean;
  /** Seconds since the current stage was entered. */
  stageAgeSec?: number | null;
  previousPassedConfirmed?: boolean;
  targetAtStop?: boolean;
  targetPassedConfirmed?: boolean;
  /**
   * A distinct matched live target observation arrived after MISSED was
   * entered. This is the only evidence allowed to reopen a false miss.
   */
  liveTargetObservedAfterMiss?: boolean;
  /** False while the timetable alone may not raise the stage. */
  scheduleMayRaise?: boolean;
  /** The reason and confidence kept when the stage is held. */
  lastReason?: RideStageReason | null;
  lastConfidence?: RideConfidence | null;
}

// ---------------------------------------------------------------------------
// Plan

/** What the plan needs from the stop catalogue. */
export type RideCatalogStop = StopSummary & Partial<LatLon>;

/** A stop as the plan saves it: only Föli's own name, and a position if known. */
export interface RideStopDetails {
  id: string;
  /** Föli's name, or "" when it gives none (never a "Stop 123" stand-in). */
  name: string;
  lat?: number;
  lon?: number;
}

export interface RidePlanStop extends RideStopDetails {
  stopSequence: number | null;
  arrivalTime: GtfsClock | "";
  departureTime: GtfsClock | "";
  timepoint: number | null;
  dropOffType: number | null;
  shapeDistTraveled: number | null;
  /** Seconds after the boarding departure, or null when the timetable makes no sense. */
  offsetSec: number | null;
  predictedEpochSec: EpochSeconds | null;
}

export interface RidePlan {
  boardingStop: RidePlanStop;
  targetStop: RidePlanStop;
  /** The stop before the exit; null only if the exit were the boarding stop. */
  previousStop: RidePlanStop | null;
  /** The stop after the exit, where a passenger who rode past can get off. */
  nextStop: RidePlanStop | null;
  /** From the boarding stop through the stop after the exit. */
  routeStops: RidePlanStop[];
  /** After the boarding stop, up to and including the exit. */
  stopsToTarget: RidePlanStop[];
  targetPredictedEpochSec: EpochSeconds | null;
}

export interface RidePlannedProgress {
  etaSec: number | null;
  /** Null until the bus is due to have left the boarding stop. */
  remainingStops: number | null;
  beforeDeparture: boolean;
}

// ---------------------------------------------------------------------------
// Matching the ride's bus in the live feed

/** What identifies the passenger's journey among a stop's live rows. */
export interface RideArrivalIdentity {
  datedVehicleJourneyRef?: string | null;
  tripRef?: string | null;
  vehicleRef?: string | null;
  lineRef?: string | null;
  originAimedDepartureTime?: EpochSeconds | null;
  /** The ride's planned time at this stop, to tell a loop's two visits apart. */
  plannedEpochSec?: EpochSeconds | null;
}

export type RideMatchMethod =
  | "dated-journey"
  | "trip"
  | "vehicle"
  | "vehicle-origin-time"
  | "line-origin-time";

export interface RideArrivalMatch {
  arrival: Arrival;
  matchedBy: RideMatchMethod;
}

/**
 * "ambiguous" is neutral evidence: the journey is listed more than once and
 * the visits cannot be told apart. It must never count as the bus being gone.
 */
export type RideArrivalResolution =
  | { status: "absent" }
  | { status: "ambiguous" }
  | ({ status: "matched" } & RideArrivalMatch);

// ---------------------------------------------------------------------------
// Shape and GPS

export interface RideShapePoint extends LatLon {
  /** Metres along the shape from its first point. */
  alongM: number;
}

export interface RideShape {
  points: RideShapePoint[];
  /**
   * The provider's own distances were in metres and are used; stop
   * distances are then on the same scale and map matching is allowed.
   */
  usesGtfsDistance: boolean;
  lengthM: number;
}

export interface RideShapeProjectionOptions {
  minAlongM?: number;
  maxAlongM?: number;
  /** Where along the shape the last good fix was, for continuity. */
  previousAlongM?: number | null;
  maxForwardJumpM?: number;
  /** How much closer one leg must be than another to not be ambiguous. */
  ambiguityDistanceM?: number;
}

export interface RideShapeProjection {
  segmentIndex: number;
  alongM: number;
  lateralDistanceM: number;
  /** Two legs of the route fit the fix about equally well. */
  ambiguous: boolean;
}

export interface RideGpsInput {
  position: LatLon;
  /** The browser's accuracy radius; NaN or null when it gave none. */
  accuracyM: number | null;
  speedMps: number | null;
  shape: RideShape | null | undefined;
  boardingShapeDistM: number | null | undefined;
  targetShapeDistM: number | null | undefined;
  previousAlongM?: number | null;
  previousFixAtMs?: number | null;
  offRouteSinceMs?: number | null;
  nowMs?: number;
}

/** No shape match to offer at all. */
export interface RideGpsUnavailable {
  usable: false;
  reason: "shape-or-accuracy-unavailable" | "shape-match-unavailable";
}

/** The fix fits two legs of a loop: shown as a diagnostic, never progress. */
export interface RideGpsAmbiguous {
  usable: false;
  reason: "shape-match-ambiguous";
  alongM: number;
  lateralDistanceM: number;
  offRouteSinceMs: null;
  offRouteSuspected: false;
  passedTarget: false;
}

export interface RideGpsMatch {
  /** Accurate enough to act on. */
  usable: boolean;
  accurateEnough: boolean;
  onRoute: boolean;
  alongM: number;
  lateralDistanceM: number;
  /** Metres along the route to the exit; negative once past it. */
  routeDistanceM: number;
  routeEtaSec: number | null;
  passedTarget: boolean;
  offRouteSinceMs: number | null;
  offRouteSuspected: boolean;
}

export type RideGpsAnalysis = RideGpsUnavailable | RideGpsAmbiguous | RideGpsMatch;

// ---------------------------------------------------------------------------
// Exit instructions

/**
 * Phrases, not text: each is an untranslated msg() key, translated where it
 * is shown, spoken or sent.
 */
interface RideExitInstructionBase {
  soonText: string;
  nextText: string;
  nextVoice: string;
  nextNotification: string;
}

/** A bus (or a trip whose type is unknown): the passenger presses STOP. */
export interface RequestStopInstruction extends RideExitInstructionBase {
  kind: "request-stop";
  afterPreviousTitle: string;
  /** Takes a {name} parameter: the stop before the exit. */
  afterPreviousText: string;
  afterPreviousLead: string;
  afterPreviousVoice: string;
  unnamedPreviousText: string;
}

/** A vehicle known not to have a STOP button. */
export interface PrepareExitInstruction extends RideExitInstructionBase {
  kind: "prepare-exit";
}

export type RideExitInstruction = RequestStopInstruction | PrepareExitInstruction;

// ---------------------------------------------------------------------------
// The ride as useRideMode keeps it

export interface RideOptions {
  locationBackup?: boolean;
  notifications?: boolean;
}

/** What RideSetup hands to startRide(). */
export interface RideConfig {
  lineRef?: string;
  destination?: string;
  tripRef?: string;
  datedVehicleJourneyRef?: string;
  vehicleRef?: string;
  originAimedDepartureTime?: EpochSeconds | null;
  routeId?: string;
  /** The trip's GTFS route_type, or null when the route is not known. */
  routeType?: number | null;
  shapeId?: string;
  boardingStop?: RidePlanStop;
  targetStop: RidePlanStop;
  previousStop?: RidePlanStop | null;
  nextStop?: RidePlanStop | null;
  plan: RidePlan;
  options?: RideOptions;
}

/** The ride saved to storage and read back after a reload. */
export interface RideSession extends RideConfig {
  id: string;
  stage: RideStage;
  stageReason: RideStageReason;
  stageConfidence: RideConfidence;
  /** Epoch milliseconds, like every other time kept on the session. */
  startedAt: number;
  stageChangedAt: number;
  expiresAt: number;
  /** The phone has ridden away from the boarding stop. Kept once known. */
  underway?: boolean;
  /** The bus has left the stop before the exit. Kept once known. */
  previousLeft?: boolean;
}

export type RideTrackingHealth = "live" | "delayed" | "schedule";

/** Which evidence the panel's estimate comes from. */
export type RideEtaSource = "location" | "live" | "schedule";

/** What the live feed has said about the ride, and what the panel shows. */
export interface RideRuntime {
  /** Epoch milliseconds, or null until it first happens. */
  lastPollAt: number | null;
  lastProviderSuccessAt: number | null;
  lastLiveMatchAt: number | null;
  targetSeenAt: number | null;
  /** Provider fields from the latest distinct target-stop SIRI observation. */
  targetSnapshotSignature: string;
  /** Provider fields from the latest distinct previous-stop SIRI observation. */
  previousSnapshotSignature: string;
  previousSeen: boolean;
  previousMissingCount: number;
  targetMissingCount: number;
  targetWasAtStop: boolean;
  targetListed: boolean;
  targetMatchBy: RideMatchMethod | "";
  liveEtaSec: number | null;
  providerDistanceM: number | null;
  providerPositionAgeSec: number | null;
  scheduleEtaSec: number | null;
  remainingStops: number | null;
  etaSec: number | null;
  gpsAgeSec: number | null;
  trackingHealth: RideTrackingHealth;
  lastError: string;
  notificationPermission: "unknown" | "granted" | "unavailable";
  /** Set once progress has first been weighed. */
  etaSource?: RideEtaSource;
  targetLive?: boolean;
}

export type RideGpsStatus =
  | "off"
  | "unavailable"
  | "starting"
  | "weak"
  | "off-route"
  | "active"
  | "error";

/** The phone's own location evidence, never saved with the ride. */
export interface RideGpsState {
  status: RideGpsStatus;
  distanceM: number | null;
  accuracyM: number | null;
  speedMps: number | null;
  minimumDistanceM: number | null;
  wasNearTarget: boolean;
  movedAwayAfterNear: boolean;
  shapeStatus: "idle" | "ready" | "unavailable";
  shapeError: string;
  shapeUsable: boolean;
  onRoute: boolean;
  alongRouteM: number | null;
  /** Epoch milliseconds of the fix that set alongRouteM. */
  alongRouteUpdatedAt: number | null;
  lateralDistanceM: number | null;
  routeDistanceM: number | null;
  routeEtaSec: number | null;
  offRouteSinceMs: number | null;
  offRouteSuspected: boolean;
  passedTarget: boolean;
  leftBoardingFixes: number;
  leftPreviousFixes: number;
  updatedAt: number | null;
  error: string;
}
