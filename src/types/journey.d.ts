export interface DestinationIntent {
  id: string;
  kind: "saved-place" | "public-stop";
  label: string;
  primaryStopId: string;
  acceptableStopIds: string[];
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
  destinationArrivalAt: number | null;
  catchability: Catchability;
  liveState: LiveState;
  rideDurationSec: number | null;
  accessSeconds: number | null;
  catchMarginSec: number | null;
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
  options: NearbyDepartureFit[];
  additionalCount: number;
  checkedAt: number;
}

export type NearbyFitMap = Record<string, NearbyStopFit>;


export type DirectJourneyOptionKind =
  | "fastest"
  | "less-walking"
  | "easier-to-catch";

export interface DirectJourneyOption {
  id: string;
  kind: DirectJourneyOptionKind;
  stopId: string;
  stopName: string;
  distanceMeters: number;
  tripRef: string;
  lineRef: string;
  destinationStopId: string;
  departureAt: number;
  destinationArrivalAt: number;
  catchability: Catchability;
  liveState: LiveState;
  catchMarginSec: number | null;
}
