export interface DestinationIntent {
  id: string;
  kind: "saved-place" | "public-stop" | "external-place";
  label: string;
  primaryStopId: string;
  acceptableStopIds: string[];
  lat?: number;
  lon?: number;
  finalWalkDistanceByStop?: Record<string, number>;
  source?: "osm-nominatim";
}

export interface PlaceSearchResult {
  id: string;
  title: string;
  subtitle: string;
  lat: number;
  lon: number;
  category: string;
  type: string;
  provider: "nominatim";
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

export interface TransferJourneyOption {
  id: string;
  originStopId: string;
  originStopName: string;
  originDistanceMeters: number;
  first: TransferTransitLeg;
  transfer: {
    alightStopId: string;
    alightStopSequence: number;
    boardStopId: string;
    boardStopName: string;
    walkingDistanceM: number;
    feasibility: TransferFeasibility;
  };
  second: TransferTransitLeg;
  destinationStopId: string;
  destinationArrivalAt: number;
  finalWalkDistanceM: number | null;
  finalWalkSecEstimate: number | null;
  journeyArrivalAt: number;
  totalWalkingDistanceM: number;
  reliability: "medium" | "low";
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
  delaySec: number | null;
  feasibility: TransferFeasibility | null;
  receivedAtMs: number | null;
  missingSinceMs: number | null;
  matchedAtMs: number | null;
  providerAgeSec: number | null;
  liveState?: LiveState;
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
  transferPlan: TransferJourneyOption | null;
  transferLeg: 1 | 2 | null;
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
  distanceMeters: number | null;
}
