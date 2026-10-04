export type JourneyMode = "leave-now" | "leave-at" | "arrive-by";

export type RoutingPreference =
  | "balanced"
  | "fewer-transfers"
  | "less-walking"
  | "more-buffer";

export interface JourneyPlan {
  mode: JourneyMode;
  targetTimeSec: number | null;
  preference: RoutingPreference;
}

export type JourneyTimeMode = "leave-now" | "leave-at" | "arrive-by";

export interface JourneyTimeConstraint {
  mode: JourneyTimeMode;
  targetTimeSec: number | null;
}

export interface DestinationIntent {
  id: string;
  kind: "saved-place" | "public-stop" | "external-place";
  label: string;
  primaryStopId: string;
  acceptableStopIds: string[];
  lat?: number;
  lon?: number;
  finalWalkDistanceByStop?: Record<string, number>;
  /** OpenStreetMap, from the place provider or the shipped place pack. */
  source?: "osm-nominatim" | "osm-places" | "osm-addresses";
}

export interface PlaceSearchBoundingBox {
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface PlaceSearchResult {
  id: string;
  title: string;
  subtitle: string;
  lat: number;
  lon: number;
  category: string;
  type: string;
  osmType?: "node" | "way" | "relation" | "";
  boundingBox?: PlaceSearchBoundingBox | null;
  provider: "nominatim" | "osm-places" | "osm-addresses";
  licence: string;
}

export type Catchability =
  | "at-stop"
  | "comfortable"
  | "likely"
  | "tight"
  | "too-late"
  | "unknown";

export type LiveState = "live" | "delayed" | "schedule" | "unknown";

export type TransferRiskState =
  | "comfortable"
  | "acceptable"
  | "tight"
  | "unlikely"
  | "broken"
  | "unknown";

export interface TransferFeasibility {
  state: TransferRiskState;
  recommendable: boolean;
  incomingArrivalAt: number | null;
  outgoingDepartureAt: number | null;
  walkingDistanceM: number | null;
  requiredSec: number | null;
  availableSec: number | null;
  slackSec: number | null;
}

export interface TransferTransitLeg {
  tripRef: string;
  lineRef: string;
  boardStopId: string;
  boardStopSequence: number | null;
  exitStopId: string;
  exitStopSequence: number | null;
  departureAt: number;
  arrivalAt: number;
  aimedDepartureAt: number | null;
  originAimedDepartureAt: number | null;
  liveState: LiveState;
}

export interface ItineraryTransfer {
  alightStopId: string;
  alightStopSequence: number;
  boardStopId: string;
  boardStopName: string;
  walkingDistanceM: number;
  feasibility: TransferFeasibility;
}

export interface MultiLegJourneyOption {
  id: string;
  originStopId: string;
  originStopName: string;
  originDistanceMeters: number;
  legs: TransferTransitLeg[];
  transfers: ItineraryTransfer[];
  destinationStopId: string;
  destinationArrivalAt: number;
  finalWalkDistanceM: number | null;
  finalWalkSecEstimate: number | null;
  journeyArrivalAt: number;
  totalWalkingDistanceM: number;
  reliability: "high" | "medium" | "low";
}

/**
 * Compatibility shape for existing one-transfer callers. New orchestration
 * must use legs[]/transfers[]; first/transfer/second are aliases only.
 */
export interface TransferJourneyOption extends MultiLegJourneyOption {
  first: TransferTransitLeg;
  transfer: ItineraryTransfer;
  second: TransferTransitLeg;
}

export interface NearbyDepartureFit {
  tripRef: string;
  lineRef: string;
  destinationStopId: string;
  departureAt: number;
  aimedDepartureAt?: number | null;
  originAimedDepartureAt?: number | null;
  destinationArrivalAt: number | null;
  finalWalkDistanceM?: number | null;
  finalWalkSecEstimate?: number | null;
  journeyArrivalAt?: number | null;
  catchability: Catchability;
  liveState: LiveState;
  rideDurationSec: number | null;
}

export type NearbyFitStatus =
  | "good"
  | "tight"
  | "too-late"
  | "other-direction"
  | "no-direct"
  | "uncertain"
  | "unavailable";

export interface NearbyStopFit {
  stopId: string;
  status: NearbyFitStatus;
  best: NearbyDepartureFit | null;
  departures: NearbyDepartureFit[];
  additionalCount: number;
  checkedAt: number;
}

export type DirectJourneyLabel =
  | "fastest"
  | "latest-departure"
  | "less-walking"
  | "easier-to-catch";

export interface DirectJourneyOption {
  id: string;
  label: DirectJourneyLabel;
  stopId: string;
  stopName: string;
  distanceMeters: number;
  departure: NearbyDepartureFit;
  arrivalDeltaSec: number;
  walkingDeltaMeters: number;
  /** Accuracy of the location fix distanceMeters was measured from. */
  positionAccuracyM?: number | null;
}

export type ActiveJourneyPhase =
  | "walking-to-stop"
  | "waiting"
  | "recovery";

export type ActiveJourneyRecoveryReason =
  | "cancelled"
  | "departed"
  | "transfer-risk"
  | "transfer-missed"
  | "transfer-cancelled"
  | null;

export type TransferProviderState =
  | "idle"
  | "live"
  | "stale"
  | "missing"
  | "degraded"
  | "cancelled";

export type TransferRevalidationDecision =
  | "unknown"
  | "good"
  | "tight"
  | "unsafe"
  | "missed"
  | "cancelled";

export interface TransferRevalidationState {
  providerState: TransferProviderState;
  decision: TransferRevalidationDecision;
  departureAt: number | null;
  feasibility: TransferFeasibility | null;
  missingSinceMs: number | null;
}

export interface ActiveDirectJourney {
  id: string;
  destinationId: string;
  destinationKind: DestinationIntent["kind"];
  destinationLabel: string;
  optionLabel: DirectJourneyLabel | "transfer";
  stopId: string;
  stopName: string;
  distanceMeters: number;
  tripRef: string;
  lineRef: string;
  destinationStopId: string;
  destinationStopSequence: number | null;
  departureAt: number;
  aimedDepartureAt: number | null;
  originAimedDepartureAt: number | null;
  destinationArrivalAt: number | null;
  journeyArrivalAt: number | null;
  finalWalkDistanceM: number | null;
  finalWalkSecEstimate: number | null;
  liveState: LiveState;
  phase: ActiveJourneyPhase;
  recoveryReason: ActiveJourneyRecoveryReason;
  selectedAt: number;
  atStopConfirmedAt: number | null;
  lastSeenAt: number;
  /** Chosen beside the boarding stop, on a fix accurate enough to tell. */
  nearStopAtSelection?: boolean;
  /** Generic itinerary source of truth, including direct journeys. */
  itinerary: MultiLegJourneyOption | null;
  /** Zero-based index of the currently authoritative transit leg. */
  activeLegIndex: number | null;
  /** Legacy one-transfer aliases retained while older component tests migrate. */
  transferPlan: TransferJourneyOption | null;
  transferLeg: 1 | 2 | null;
  /** Live state for each committed future leg, keyed by zero-based leg index. */
  futureLegRevalidations?: Record<number, TransferRevalidationState>;
  transferRevalidation?: TransferRevalidationState | null;
}

export type NearbyFitMap = Record<string, NearbyStopFit>;


export interface FinalWalkIntent {
  destinationId: string;
  destinationLabel: string;
  lat: number;
  lon: number;
  fromStopId: string;
  fromStopName: string;
  fromLat?: number;
  fromLon?: number;
  distanceMeters: number | null;
}
