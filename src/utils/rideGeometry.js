import { distanceInMeters, hasCoordinates } from "./geo";

/**
 * @import { LatLon, ShapePoint } from "../types/foli"
 * @import {
 *   RideGpsAnalysis,
 *   RideGpsInput,
 *   RideShape,
 *   RideShapePoint,
 *   RideShapeProjection,
 *   RideShapeProjectionOptions,
 * } from "../types/ride"
 */

/**
 * @typedef {object} ProjectionCandidate
 * @property {number} score Lower is better.
 * @property {number} segmentIndex
 * @property {number} alongM
 * @property {number} lateralDistanceM
 */

const EARTH_RADIUS_METERS = 6_371_008.8;
const MAX_GPS_ACCURACY_METERS = 120;
const OFF_ROUTE_CONFIRM_MS = 120_000;
const MAX_ROUTE_SPEED_MPS = 40;
const FORWARD_JUMP_TOLERANCE_M = 200;

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * @param {number} value
 * @returns {number}
 */
function toRadians(value) {
  return (value * Math.PI) / 180;
}

/**
 * Metres east (x) and north (y) of `origin`, on a local flat approximation.
 * @param {LatLon} point
 * @param {LatLon} origin
 * @returns {{ x: number, y: number } | null}
 */
function localXY(point, origin) {
  const latitude = finiteNumber(point?.lat);
  const longitude = finiteNumber(point?.lon);
  const originLat = finiteNumber(origin?.lat);
  const originLon = finiteNumber(origin?.lon);

  if (
    latitude === null ||
    longitude === null ||
    originLat === null ||
    originLon === null
  ) {
    return null;
  }

  const meanLat = toRadians((latitude + originLat) / 2);

  return {
    x:
      toRadians(longitude - originLon) *
      Math.cos(meanLat) *
      EARTH_RADIUS_METERS,
    y: toRadians(latitude - originLat) * EARTH_RADIUS_METERS,
  };
}

/**
 * @param {ShapePoint[] | null | undefined} points
 * @returns {RideShape | null} Null for fewer than two usable points.
 */
export function prepareRideShape(points) {
  const valid = (Array.isArray(points) ? points : []).filter(hasCoordinates);
  if (valid.length < 2) return null;

  const gtfsDistances = valid.map((point) => finiteNumber(point?.traveled));
  const hasMonotonicGtfsDistances = gtfsDistances.every(
    /** @returns {value is number} */
    (value, index) =>
      value !== null &&
      value >= 0 &&
      // every() stops at the first failure, so the previous value already
      // passed the null check.
      (index === 0 ||
        value >= /** @type {number} */ (gtfsDistances[index - 1]))
  );

  let cumulative = 0;
  const normalized = valid.map((point, index) => {
    if (index > 0) {
      cumulative +=
        distanceInMeters(valid[index - 1], point) || 0;
    }

    return {
      lat: Number(point.lat),
      lon: Number(point.lon),
      alongM: hasMonotonicGtfsDistances
        ? gtfsDistances[index]
        : cumulative,
    };
  });

  // Föli documents `traveled` as a cumulative distance without a unit, and
  // every threshold that reads it (600 m, 110 m) is in metres. Kilometres
  // would place a passenger at their stop as the ride began. The provider's
  // length has to agree with the drawn path to within a factor of two
  // before it is trusted; otherwise the shape is not used at all.
  // Never empty: `valid` has at least two points.
  const gtfsLength = hasMonotonicGtfsDistances
    ? /** @type {number} */ (gtfsDistances.at(-1)) - gtfsDistances[0]
    : 0;
  const metreScale =
    hasMonotonicGtfsDistances &&
    cumulative > 0 &&
    gtfsLength / cumulative >= 0.5 &&
    gtfsLength / cumulative <= 2;

  return {
    points: normalized,
    usesGtfsDistance: metreScale,
    // Never empty, as above.
    lengthM: /** @type {RideShapePoint} */ (normalized.at(-1)).alongM,
  };
}

/**
 * Where on the segment from `start` to `end` lies closest to `position`.
 * @param {LatLon} position
 * @param {LatLon} start
 * @param {LatLon} end
 * @returns {{ t: number, lateralDistanceM: number } | null} `t` runs from 0
 *   at `start` to 1 at `end`.
 */
function segmentProjection(position, start, end) {
  const startXY = localXY(start, position);
  const endXY = localXY(end, position);
  if (!startXY || !endXY) return null;

  const dx = endXY.x - startXY.x;
  const dy = endXY.y - startXY.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared <= 1e-6
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            -((startXY.x * dx + startXY.y * dy) / lengthSquared)
          )
        );

  const x = startXY.x + t * dx;
  const y = startXY.y + t * dy;

  return {
    t,
    lateralDistanceM: Math.hypot(x, y),
  };
}

/**
 * @param {LatLon} position
 * @param {RideShape | null | undefined} shape
 * @param {RideShapeProjectionOptions} [options]
 * @returns {RideShapeProjection | null}
 */
export function projectPositionToRideShape(
  position,
  shape,
  {
    minAlongM = Number.NEGATIVE_INFINITY,
    maxAlongM = Number.POSITIVE_INFINITY,
    previousAlongM = null,
    maxForwardJumpM = Number.POSITIVE_INFINITY,
    ambiguityDistanceM = 20,
  } = {}
) {
  if (!hasCoordinates(position) || !shape?.points?.length) return null;

  const previous = finiteNumber(previousAlongM);
  /** @type {ProjectionCandidate[]} */
  const candidates = [];

  for (let index = 0; index < shape.points.length - 1; index += 1) {
    const start = shape.points[index];
    const end = shape.points[index + 1];

    if (end.alongM < minAlongM || start.alongM > maxAlongM) {
      continue;
    }

    const projection = segmentProjection(position, start, end);
    if (!projection) continue;

    const alongM =
      start.alongM +
      projection.t * Math.max(0, end.alongM - start.alongM);

    if (alongM < minAlongM || alongM > maxAlongM) continue;

    const forwardLimit = finiteNumber(maxForwardJumpM);
    if (
      previous !== null &&
      forwardLimit !== null &&
      alongM > previous + Math.max(0, forwardLimit)
    ) {
      continue;
    }

    // GPS can sit near two legs of a loop. Prefer continuity instead of
    // snapping hundreds of metres backwards to a geometrically close segment.
    const backwardsM =
      previous === null ? 0 : Math.max(0, previous - alongM - 80);
    const score =
      projection.lateralDistanceM + backwardsM * 4;

    candidates.push({
      score,
      segmentIndex: index,
      alongM,
      lateralDistanceM: projection.lateralDistanceM,
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.score - b.score);

  let best = candidates[0];
  const ambiguityGapM = Math.max(
    20,
    finiteNumber(ambiguityDistanceM) ?? 20
  );
  const nearAlternatives = candidates.filter(
    (candidate) =>
      candidate !== best &&
      candidate.lateralDistanceM <=
        best.lateralDistanceM + ambiguityGapM &&
      Math.abs(candidate.alongM - best.alongM) >= 250
  );

  if (nearAlternatives.length > 0) {
    if (previous === null) {
      return {
        segmentIndex: best.segmentIndex,
        alongM: best.alongM,
        lateralDistanceM: best.lateralDistanceM,
        ambiguous: true,
      };
    }

    const continuityRanked = [best, ...nearAlternatives]
      .map((candidate) => ({
        candidate,
        delta: Math.abs(candidate.alongM - previous),
      }))
      .sort((a, b) => a.delta - b.delta);

    best = continuityRanked[0].candidate;
    if (
      continuityRanked[1] &&
      continuityRanked[1].delta - continuityRanked[0].delta < 250
    ) {
      return {
        segmentIndex: best.segmentIndex,
        alongM: best.alongM,
        lateralDistanceM: best.lateralDistanceM,
        ambiguous: true,
      };
    }
  }

  return {
    segmentIndex: best.segmentIndex,
    alongM: best.alongM,
    lateralDistanceM: best.lateralDistanceM,
    ambiguous: false,
  };
}

/**
 * @param {RideGpsInput} input
 * @returns {RideGpsAnalysis}
 */
export function analyzeRideGps({
  position,
  accuracyM,
  speedMps,
  shape,
  boardingShapeDistM,
  targetShapeDistM,
  previousAlongM = null,
  previousFixAtMs = null,
  offRouteSinceMs = null,
  nowMs = Date.now(),
}) {
  const accuracy = finiteNumber(accuracyM);
  const speed = finiteNumber(speedMps);
  const boarding = finiteNumber(boardingShapeDistM);
  const target = finiteNumber(targetShapeDistM);

  if (
    !shape ||
    boarding === null ||
    target === null ||
    target <= boarding ||
    accuracy === null ||
    accuracy < 0
  ) {
    return {
      usable: false,
      reason: "shape-or-accuracy-unavailable",
    };
  }

  const previousFixAt = finiteNumber(previousFixAtMs);
  const currentTime = finiteNumber(nowMs) ?? Date.now();
  const elapsedSincePreviousSec =
    previousFixAt !== null && currentTime >= previousFixAt
      ? Math.min(5 * 60, (currentTime - previousFixAt) / 1000)
      : null;
  const maxForwardJumpM =
    finiteNumber(previousAlongM) !== null && elapsedSincePreviousSec !== null
      ? FORWARD_JUMP_TOLERANCE_M +
        accuracy * 2 +
        MAX_ROUTE_SPEED_MPS * elapsedSincePreviousSec
      : Number.POSITIVE_INFINITY;

  const projection = projectPositionToRideShape(position, shape, {
    minAlongM: Math.max(0, boarding - 300),
    maxAlongM: Math.min(shape.lengthM, target + 700),
    previousAlongM,
    maxForwardJumpM,
    // A vague fix can make two nearby legs of a loop indistinguishable even
    // when their centre lines differ by more than the old fixed 20 metres.
    ambiguityDistanceM: Math.max(20, Math.min(100, accuracy)),
  });

  if (!projection) {
    return {
      usable: false,
      reason: "shape-match-unavailable",
    };
  }

  if (projection.ambiguous) {
    return {
      usable: false,
      reason: "shape-match-ambiguous",
      alongM: projection.alongM,
      lateralDistanceM: projection.lateralDistanceM,
      offRouteSinceMs: null,
      offRouteSuspected: false,
      passedTarget: false,
    };
  }

  const corridorM = Math.max(
    100,
    Math.min(220, accuracy * 1.5)
  );
  const accurateEnough = accuracy <= MAX_GPS_ACCURACY_METERS;
  const onRoute =
    accurateEnough && projection.lateralDistanceM <= corridorM;

  const routeDistanceM = target - projection.alongM;
  const routeEtaSec =
    onRoute &&
    speed !== null &&
    speed >= 2 &&
    speed <= 40 &&
    routeDistanceM > 0
      ? routeDistanceM / speed
      : null;

  /** @type {number | null} */
  let nextOffRouteSinceMs = null;
  if (accurateEnough && !onRoute) {
    nextOffRouteSinceMs =
      finiteNumber(offRouteSinceMs) ?? Number(nowMs);
  }

  const offRouteSuspected =
    nextOffRouteSinceMs !== null &&
    Number(nowMs) - nextOffRouteSinceMs >= OFF_ROUTE_CONFIRM_MS;

  return {
    usable: accurateEnough,
    accurateEnough,
    onRoute,
    alongM: projection.alongM,
    lateralDistanceM: projection.lateralDistanceM,
    routeDistanceM,
    routeEtaSec,
    passedTarget: onRoute && routeDistanceM < -200,
    offRouteSinceMs: nextOffRouteSinceMs,
    offRouteSuspected,
  };
}
