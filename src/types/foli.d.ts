// Shapes the app works with after src/api/foliApi.js has normalized Föli's
// answers. Föli's raw payloads are never trusted to match these: every field
// is read defensively and coerced, so the types describe what leaves the API
// layer, not what data.foli.fi promises.

/** Unix time in seconds, as Föli's SIRI feed and GTFS arithmetic use it. */
export type EpochSeconds = number;

/** GTFS clock text, "HH:MM:SS"; hours may pass 24 for after-midnight trips. */
export type GtfsClock = string;

/** A service day in GTFS form, "YYYYMMDD". */
export type ServiceDateKey = string;

/** One departure on a stop board: a live SIRI row, or a timetable row in its shape. */
export interface Arrival {
  lineref: string;
  destinationdisplay: string;
  destinationdisplay_en: string;
  destinationdisplay_sv: string;
  /** True only for a realtime-tracked vehicle. Timetable rows are false. */
  monitored: boolean;
  vehicleatstop: boolean;
  vehicleref: string;
  incongestion: boolean;
  directionname: string;
  destinationref: string;
  originref: string;
  visitnumber: number | null;
  blockref: string;
  dataframeref: string;
  datedvehiclejourneyref: string;
  tripref: string;
  routeref: string;
  delay: number | null;
  recordedattime: EpochSeconds | null;
  latitude: number | null;
  longitude: number | null;
  originaimeddeparturetime: EpochSeconds | null;
  destinationaimedarrivaltime: EpochSeconds | null;
  expecteddeparturetime: EpochSeconds | null;
  expectedarrivaltime: EpochSeconds | null;
  aimeddeparturetime: EpochSeconds | null;
  aimedarrivaltime: EpochSeconds | null;
}

/** A timetable departure: always has its aimed times. */
export interface ScheduledArrival extends Arrival {
  monitored: false;
  aimeddeparturetime: EpochSeconds;
  aimedarrivaltime: EpochSeconds;
}

export interface StopMonitorResult {
  stopName: string;
  arrivals: Arrival[];
  serverTime: EpochSeconds;
  realtimeAvailable: boolean;
  scheduleAvailable: boolean;
  scheduleFailed: boolean;
  scheduleIncomplete: boolean;
}

export interface StopMonitorOptions {
  /** False returns realtime rows only: Ride Mode must not read timetable rows as vehicles. */
  scheduleFallback?: boolean;
}

export interface StopSummary {
  id: string;
  name: string;
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Route {
  id: string;
  shortName: string;
  longName: string;
  type: number | null;
  /** "#rrggbb", or null when Föli gives none or an invalid one. */
  color: string | null;
  textColor: string | null;
}

export interface StopTimetableRow {
  tripId: string;
  arrivalTime: GtfsClock;
  departureTime: GtfsClock;
  stopSequence: number | null;
  pickupType: number | null;
  dropOffType: number | null;
  shapeDistTraveled: number | null;
}

export interface CalendarEntry {
  monday: number | null;
  tuesday: number | null;
  wednesday: number | null;
  thursday: number | null;
  friday: number | null;
  saturday: number | null;
  sunday: number | null;
  startDate: string;
  endDate: string;
}

export type Calendar = Record<string, CalendarEntry>;

export interface CalendarDate {
  date: ServiceDateKey;
  exceptionType: number | null;
}

export type CalendarDates = Record<string, CalendarDate[]>;

export interface TripDetails {
  tripId: string;
  routeId: string;
  serviceId: string;
  headsign: string;
  directionId: number | null;
  blockId: string;
  shapeId: string;
  wheelchairAccessible: number | null;
  bikesAllowed: number | null;
}

/** The part of a trip a timetable departure is built from. */
export type TripHeader = Pick<TripDetails, "routeId" | "serviceId" | "headsign" | "blockId">;

export interface RouteTrip extends TripHeader {
  tripId: string;
}

export interface TripStopTime {
  stopId: string;
  arrivalTime: GtfsClock;
  departureTime: GtfsClock;
  stopSequence: number;
  pickupType: number | null;
  dropOffType: number | null;
  timepoint: number | null;
  shapeDistTraveled: number | null;
}

export interface ShapePoint extends LatLon {
  /** Distance along the shape, in Föli's shape_dist_traveled units. */
  traveled: number | null;
}

/** One timetable row placed on a concrete service day. */
export interface ClockCandidate<Row = StopTimetableRow> {
  row: Row;
  tripId: string;
  serviceDate: ServiceDateKey;
  aimedDepartureTime: EpochSeconds;
  aimedArrivalTime: EpochSeconds;
}

export interface ScheduledDepartures {
  departures: ScheduledArrival[];
  /** False when the list stops early at a trip whose metadata could not be read. */
  complete: boolean;
}

/** GeoJSON MultiPolygon positions: polygons → rings → [lon, lat]. */
export type MultiPolygonCoordinates = number[][][][];

export interface ServiceBoundary {
  type: "MultiPolygon";
  coordinates: MultiPolygonCoordinates;
}
