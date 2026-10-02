# Local-state backup

Turku Departures can export a small, inspectable JSON backup before a browser/origin migration.

## Portable state

The v1 backup whitelist contains only:

- My Places: public Föli stop IDs/names, main-stop choice and the local update timestamp;
- favourite stops;
- per-stop line filters;
- an explicit interface language choice (English, Finnish, Ukrainian or Swedish), when one exists;
- an explicit light/dark theme choice, when one exists.

## Deliberately excluded

The backup never reads or exports:

- recent stops or their viewed-at timestamps;
- active Ride Mode or Active Journey state;
- GPS coordinates, accuracy, telemetry or location history;
- cached departure boards/provider responses;
- place-search session cache;
- browser/device identifiers.

The format is versioned as `turku-departures-local-state` v1 and capped at 128 KB. Export verifies the serialized document against the same limit, so the app never downloads a file this version would reject on import.

## Import semantics

Import is preview-first and explicit. It merges rather than replaces:

- newer saved places and line filters already on the destination origin win over older backup values;
- current favourites are preserved and every valid unique imported favourite is merged;
- recent stops stay local to the destination browser;
- language/theme are imported only when the destination has no explicit choice;
- malformed, unknown or oversized content fails closed;
- the multi-key write is rollback-attempted if local storage fails before completion;
- no success event is emitted for a partial/failed apply.

This is an origin-migration aid, not cloud sync. Nothing is uploaded by Turku Departures.


## Production-origin migration

The production-domain runbook is [DOMAIN_CUTOVER.md](DOMAIN_CUTOVER.md). Before any cross-origin cutover, download the backup on the old origin and import it explicitly on the new one. Automatic cross-origin browser-storage migration is intentionally impossible.
