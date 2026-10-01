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
  | null;

export interface ActiveDirectJourney {
  id: string;
  destinationId: string;
  destinationKind: DestinationIntent["kind"];
  destinationLabel: string;
  optionLabel: DirectJourneyLabel;
  stopId: string;
  stopName: string;
  distanceMeters: number;
  tripRef: string;
  lineRef: string;
  destinationStopId: string;
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
}

export type NearbyFitMap = Record<string, NearbyStopFit>;
