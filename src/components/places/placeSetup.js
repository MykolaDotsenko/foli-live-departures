// The rules for setting a place up from where the passenger stands: how
// far away a stop may be, when a location fix is good enough to pick the
// nearest stop for them, and how ticking stops moves the main stop along.

export const MAX_SETUP_DISTANCE_METERS = 10_000;
export const AUTO_PRESELECT_MAX_DISTANCE_METERS = 2_000;
export const LOW_ACCURACY_METERS = 250;

export function isAccurateFix(accuracy) {
  return Number.isFinite(accuracy) && accuracy <= LOW_ACCURACY_METERS;
}

export function isReliableSetupLocation(accuracy, candidates) {
  return (
    isAccurateFix(accuracy) &&
    Number.isFinite(candidates[0]?.distanceMeters) &&
    candidates[0].distanceMeters <= AUTO_PRESELECT_MAX_DISTANCE_METERS
  );
}

export function toggleStopSelection(
  selectedIds,
  primaryStopId,
  stopId,
  candidates
) {
  const next = new Set(selectedIds);
  let nextPrimaryStopId = primaryStopId;

  if (next.has(stopId)) {
    next.delete(stopId);
    if (primaryStopId === stopId) {
      nextPrimaryStopId =
        candidates.find(
          (candidate) => candidate.id !== stopId && next.has(candidate.id)
        )?.id || "";
    }
  } else {
    next.add(stopId);
    if (!primaryStopId) nextPrimaryStopId = stopId;
  }

  return { selectedIds: next, primaryStopId: nextPrimaryStopId };
}
