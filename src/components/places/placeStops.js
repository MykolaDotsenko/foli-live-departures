// Which stops a saved place stands for. A place keeps only public stop
// numbers and names; the live stop list fills in the rest (coordinates for
// the route link, today's name), and the main stop is the one a passenger
// is sent to first.

export function resolvePlaceStops(place, stops) {
  const byId = new Map(stops.map((stop) => [stop.id, stop]));

  return (Array.isArray(place?.stops) ? place.stops : []).map((savedStop) => ({
    ...savedStop,
    ...(byId.get(savedStop.id) || {}),
  }));
}

export function primaryStopOf(resolvedStops, primaryStopId) {
  return (
    resolvedStops.find((stop) => stop.id === primaryStopId) ||
    resolvedStops[0]
  );
}
