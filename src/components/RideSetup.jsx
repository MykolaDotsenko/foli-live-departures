import { useEffect, useMemo, useRef, useState } from "react";
import { fetchTripDetails, fetchTripStopTimes } from "../api/foliApi";
import { msg, t, useLanguage } from "../i18n";
import {
  buildRidePlan,
  resolveRideBoardingIndex,
} from "../utils/rideProgress";
import { formatClock, getDepartureTime } from "../utils/time";
import styles from "./RideSetup.module.css";
import StopName from "./StopName";
import useScrollPaddingFor from "../hooks/useScrollPaddingFor";
import { stopLabel } from "../utils/stopNames";

function plannedClock(value) {
  if (typeof value !== "string") return "";
  const match = value.match(/^(\d{1,3}):(\d{2}):\d{2}$/);
  if (!match) return "";

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) {
    return "";
  }

  return `${String(hour % 24).padStart(2, "0")}:${String(minute).padStart(
    2,
    "0"
  )}`;
}

// "route point 900 m" was `shape_dist_traveled` straight out of GTFS. What a
// passenger actually wants from a list of stop names is how far along the
// ride each one is, so that is what this says instead.
function stopsAwayLabel(count) {
  const stops = Number(count);
  if (!Number.isFinite(stops) || stops <= 1) return t("Next stop");
  return t("{count} stops away", { count: stops });
}

function stopName(stopsById, stopId) {
  return (
    stopsById?.get?.(String(stopId))?.name || t("Stop {id}", { id: stopId })
  );
}

// An option shows the catalogue's name, or its number when the catalogue
// does not list it. Named here, where it is shown, so the stand-in follows
// the language.
function optionName(item) {
  return stopLabel(item.stop, item.stopId);
}

// "Line 1 leaves 17:41" is one phrase: in Finnish the line, the verb and the
// time do not fall where they do in English.
function departureContext(arrival) {
  const leaves = getDepartureTime(arrival);
  if (arrival.lineref) {
    return leaves
      ? t("Line {line} leaves {time}", {
          line: arrival.lineref,
          time: formatClock(leaves),
        })
      : t("Line {line}", { line: arrival.lineref });
  }
  return leaves
    ? t("This trip leaves {time}", { time: formatClock(leaves) })
    : t("This trip");
}

function savedPlaceLabels(placesById, stopId) {
  if (!(placesById instanceof Map)) return [];

  return [...placesById.values()]
    .filter((place) =>
      place?.stops?.some((stop) => String(stop.id) === String(stopId))
    )
    .map((place) => place.label)
    .filter(Boolean);
}

const TRIP_DETAILS_RETRY_MS = 1_500;

// Notifications from a web page need the Notification API, which iPhone
// Safari only gives an app added to the Home Screen. Offering the option
// where it cannot work promised an alert that would never come.
function notificationSupport() {
  if (typeof globalThis.Notification === "function") return "supported";

  const navigatorRef = globalThis.navigator;
  const ios =
    /iPad|iPhone|iPod/.test(navigatorRef?.userAgent || "") ||
    (navigatorRef?.platform === "MacIntel" && navigatorRef?.maxTouchPoints > 1);
  return ios ? "home-screen-only" : "unsupported";
}

// iPhones, and most browsers on a computer, have no Vibration API: a page
// that promised vibration there promised an alert the passenger would never
// feel.
function canVibrate() {
  return typeof globalThis.navigator?.vibrate === "function";
}

export default function RideSetup({
  arrival,
  currentStopId,
  currentStopName,
  stopsById,
  placesById,
  routesById,
  routesByShortName,
  preferredTargetStopId = "",
  preferredTargetStopSequence = null,
  journeyDriven = false,
  onStart,
  onCancel,
}) {
  // Every word below follows the language, including a switch mid-choice.
  useLanguage();
  const [status, setStatus] = useState("loading");
  const [stopTimes, setStopTimes] = useState([]);
  const [tripDetails, setTripDetails] = useState(null);
  const [targetStopSequence, setTargetStopSequence] = useState("");
  const [locationBackup, setLocationBackup] = useState(true);
  const [notificationsAvailable] = useState(notificationSupport);
  const [vibrates] = useState(canVibrate);
  // Off until asked for. On, Start raised a location prompt, a notification
  // prompt and the test sound together, as the bus pulled in, for alerts
  // that only work while this page is open anyway.
  const [notifications, setNotifications] = useState(false);
  const nativeAndroidBuild =
    String(import.meta.env.VITE_NATIVE_BUILD || "") === "true";
  const [nativeForeground, setNativeForeground] = useState(false);
  const [startError, setStartError] = useState("");
  const [changeStop, setChangeStop] = useState(false);
  const panelRef = useRef(null);
  // The Start bar is fixed to the bottom of a phone: what is focused below
  // the fold must stop above it, not behind it.
  const [actionsElement, setActionsElement] = useState(null);
  useScrollPaddingFor(actionsElement, "bottom");

  // The setup opens inside the tapped row, often below the fold, while the
  // button that starts the ride is pinned to the bottom of a phone screen.
  // Bringing the panel into view means the stop it will start with is on
  // screen before that button can be pressed. On a phone it goes to the
  // top: brought in only as far as its first lines, the second stop to
  // choose from sat under that pinned button.
  useEffect(() => {
    const phone = globalThis.matchMedia?.("(max-width: 620px)")?.matches === true;
    panelRef.current?.scrollIntoView?.({ block: phone ? "start" : "nearest" });
  }, []);

  useEffect(() => {
    if (!arrival?.tripref) {
      setStatus("error");
      return undefined;
    }

    const controller = new AbortController();
    setStatus("loading");

    // The trip's details carry its route and shape. One try on a weak
    // connection lost both for the whole ride: no "Press STOP", and no
    // location tracking along the route. So they get a second try.
    const tripDetailsWithRetry = () =>
      fetchTripDetails(arrival.tripref, controller.signal).catch(
        () =>
          new Promise((resolve) => {
            const timer = globalThis.setTimeout(resolve, TRIP_DETAILS_RETRY_MS);
            controller.signal.addEventListener("abort", () => {
              globalThis.clearTimeout(timer);
              resolve();
            });
          }).then(() =>
            controller.signal.aborted
              ? null
              : fetchTripDetails(arrival.tripref, controller.signal)
          )
      );

    Promise.all([
      fetchTripStopTimes(arrival.tripref, controller.signal),
      tripDetailsWithRetry().catch(() => null),
    ])
      .then(([items, details]) => {
        if (controller.signal.aborted) return;
        setStopTimes(items);
        setTripDetails(details);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });

    return () => controller.abort();
  }, [arrival?.tripref]);

  const boardingIndex = useMemo(
    () =>
      resolveRideBoardingIndex(
        stopTimes,
        currentStopId,
        arrival?.aimeddeparturetime
      ),
    [arrival?.aimeddeparturetime, currentStopId, stopTimes]
  );

  const downstream = useMemo(() => {
    if (boardingIndex < 0) return [];

    // Counted against the unfiltered trip, because the bus stops at every
    // row whether or not passengers may alight there. Counting the filtered
    // list would put "after X" one stop out whenever a no-drop-off stop sits
    // between two choices, and disagree with the panel shown during the ride.
    return stopTimes
      .map((item, index) => ({ item, index }))
      .filter(
        ({ item, index }) =>
          index > boardingIndex && Number(item.dropOffType) !== 1
      )
      .map(({ item, index }) => ({
        ...item,
        // Facts only: the names are worked out where they are shown, so a
        // stand-in like "Stop 123" follows a language switch.
        stop: stopsById.get(String(item.stopId)) || null,
        places: savedPlaceLabels(placesById, item.stopId),
        stopsAway: index - boardingIndex,
        previousIsBoarding: index - 1 === boardingIndex,
        previousStopId: stopTimes[index - 1]?.stopId,
      }));
  }, [boardingIndex, placesById, stopTimes, stopsById]);

  // A journey the passenger explicitly selected is the strongest prefill.
  // Without one, keep the existing Home-primary behaviour. Neither path
  // starts the alert by itself: the passenger still reviews and presses Start.
  useEffect(() => {
    if (targetStopSequence || downstream.length === 0) return;

    const hasPreferredSequence =
      preferredTargetStopSequence !== null &&
      preferredTargetStopSequence !== undefined &&
      preferredTargetStopSequence !== "";
    const preferredSequence = hasPreferredSequence
      ? Number(preferredTargetStopSequence)
      : null;
    const preferred = downstream.find(
      (item) =>
        (Number.isFinite(preferredSequence) &&
          Number(item.stopSequence) === preferredSequence) ||
        ((!Number.isFinite(preferredSequence) || preferredSequence === null) &&
          preferredTargetStopId &&
          String(item.stopId) === String(preferredTargetStopId))
    );

    if (preferred) {
      setTargetStopSequence(String(preferred.stopSequence));
      return;
    }

    const homeStops = downstream.filter((item) =>
      item.places.includes("Home")
    );
    if (homeStops.length === 0) return;

    const primaryStopId = String(
      (placesById instanceof Map && placesById.get("home")?.primaryStopId) ||
        ""
    );
    const home =
      homeStops.find((item) => String(item.stopId) === primaryStopId) ||
      homeStops[0];
    setTargetStopSequence(String(home.stopSequence));
  }, [
    downstream,
    placesById,
    preferredTargetStopId,
    preferredTargetStopSequence,
    targetStopSequence,
  ]);

  const chosenStop = downstream.find(
    (item) => String(item.stopSequence) === String(targetStopSequence)
  );

  const start = () => {
    const departureEpochSec = getDepartureTime(arrival);
    const selectedTarget = downstream.find(
      (item) => String(item.stopSequence) === String(targetStopSequence)
    );

    // Returning quietly here leaves an enabled button that does nothing when
    // pressed, on the one action the whole feature hangs on. The error is
    // kept as a phrase and translated where it is shown.
    if (!selectedTarget) {
      setStartError(
        msg("Choose the stop you want to get off at first.")
      );
      return;
    }

    if (!departureEpochSec) {
      setStartError(
        msg(
          "We do not have a departure time for this bus yet. Wait for the board to refresh and try again."
        )
      );
      return;
    }

    const plan = buildRidePlan({
      stopTimes,
      currentStopId,
      currentStopAimedEpochSec: arrival.aimeddeparturetime,
      targetStopId: selectedTarget.stopId,
      targetStopSequence: selectedTarget.stopSequence,
      stopsById,
      departureEpochSec,
    });
    if (!plan) {
      setStartError(
        msg(
          "We cannot work out a reliable plan for that stop on this trip. Try another stop, or start the ride from a different departure."
        )
      );
      return;
    }

    setStartError("");

    // The trip's own route, or else the line's, so a ride whose details
    // did not load still knows it is a bus.
    const exactRoute =
      (tripDetails?.routeId && routesById instanceof Map
        ? routesById.get(tripDetails.routeId)
        : null) ||
      (arrival.lineref && routesByShortName instanceof Map
        ? routesByShortName.get(arrival.lineref)
        : null) ||
      null;

    onStart?.({
      lineRef: arrival.lineref || "",
      destination:
        arrival.destinationdisplay ||
        arrival.destinationdisplay_en ||
        arrival.destinationdisplay_sv ||
        "",
      tripRef: arrival.tripref || "",
      datedVehicleJourneyRef: arrival.datedvehiclejourneyref || "",
      vehicleRef: arrival.vehicleref || "",
      originAimedDepartureTime: arrival.originaimeddeparturetime || null,
      routeId: tripDetails?.routeId || "",
      routeType: exactRoute?.type ?? null,
      shapeId: tripDetails?.shapeId || "",
      boardingStop: plan.boardingStop,
      targetStop: plan.targetStop,
      previousStop: plan.previousStop,
      nextStop: plan.nextStop,
      plan,
      options: {
        locationBackup,
        notifications: notificationsAvailable === "supported" && notifications,
        nativeForeground:
          nativeAndroidBuild && locationBackup && nativeForeground,
      },
    });
  };

  const ambiguousBoarding =
    status === "ready" &&
    stopTimes.some(
      (item) => String(item.stopId) === String(currentStopId)
    ) &&
    boardingIndex < 0;

  return (
    <section
      ref={panelRef}
      className={styles.panel}
      aria-label={t("Set up get-off alerts")}
    >
      <div className={styles.heading}>
        <div className={styles.headingText}>
          <p className={styles.kicker}>{t("Get-off alert")}</p>
          {/* Under the board's h1, so an h2: as an h4 it skipped two
              levels of the page's outline. */}
          <h2 id="ride-setup-title" tabIndex={-1}>
            {journeyDriven && chosenStop
              ? t("Get off at {name}", { name: optionName(chosenStop) })
              : t("Where do you want to get off?")}
          </h2>
          {!journeyDriven && (
            <p>
              {t(
                "Pick your stop and keep this page open with the sound on. You do not have to watch it: we tell you when to press STOP."
              )}
            </p>
          )}
        </div>
        <button type="button" className={styles.close} onClick={onCancel}>
          {t("Cancel")}
        </button>
      </div>

      {status === "loading" && (
        <p className={styles.status} role="status">
          {t("Loading this trip's planned stops…")}
        </p>
      )}

      {/* Trip stops are kept in memory only, so offline this is the
          answer for any bus not opened since the page loaded. */}
      {status === "error" && (
        <p className={styles.status} role="alert">
          {globalThis.navigator?.onLine === false
            ? t("The get-off alert needs a connection to load this bus's stops.")
            : t(
                "We cannot load this bus's stops right now. Close this and try again in a moment."
              )}
        </p>
      )}

      {ambiguousBoarding && (
        <p className={styles.status} role="alert">
          {t(
            "This bus comes back to this stop later on its route, and we cannot tell which pass you are boarding. We will not guess about your stop."
          )}
        </p>
      )}

      {status === "ready" &&
        !ambiguousBoarding &&
        downstream.length === 0 && (
          <p className={styles.status}>
            {t("No later drop-off stops are available for this trip.")}
          </p>
        )}

      {status === "ready" &&
        !ambiguousBoarding &&
        downstream.length > 0 && (
          <>
            {(!journeyDriven || changeStop || !chosenStop) && (
              <fieldset className={styles.stopList}>
              <legend className={styles.srOnly}>
                {t("Choose your exit stop")}
              </legend>
              {downstream.map((item) => {
                const clock = plannedClock(
                  item.departureTime || item.arrivalTime
                );
                const previousStopName = item.previousIsBoarding
                  ? currentStopName
                  : stopName(stopsById, item.previousStopId);

                return (
                  <label
                    key={`${item.stopId}-${item.stopSequence}`}
                    className={styles.stopOption}
                    data-selected={
                      String(targetStopSequence) === String(item.stopSequence)
                        ? "true"
                        : "false"
                    }
                  >
                    <input
                      type="radio"
                      name={`ride-target-${arrival.tripref}`}
                      value={item.stopSequence}
                      checked={
                        String(targetStopSequence) === String(item.stopSequence)
                      }
                      onChange={() => {
                        setStartError("");
                        setTargetStopSequence(String(item.stopSequence));
                      }}
                    />
                    <span className={styles.stopCopy}>
                      {/* Föli's name, marked Finnish, so a screen reader in
                          English says "Puistokatu" as it is written. */}
                      <strong>
                        <StopName stop={item.stop} id={item.stopId} />
                      </strong>
                      <small>
                        {stopsAwayLabel(item.stopsAway)}
                        {clock ? ` · ${t("around {time}", { time: clock })}` : ""}
                        {previousStopName
                          ? ` · ${t("after {name}", { name: previousStopName })}`
                          : ""}
                      </small>
                    </span>
                    {item.places.length > 0 && (
                      <>
                        {/* Heard, not seen: without it the badge ran on
                            from the line before, "…after KauppatoriHome". */}
                        <span className={styles.srOnly}> · </span>
                        <span className={styles.placeBadge}>
                          {/* The labels are My Places' own phrases ("Home"). */}
                          {item.places.map((label) => t(label)).join(" · ")}
                        </span>
                      </>
                    )}
                  </label>
                );
              })}
              </fieldset>
            )}

            {journeyDriven && chosenStop && !changeStop && (
              <button
                type="button"
                className={styles.close}
                onClick={() => setChangeStop(true)}
              >
                {t("Change stop")}
              </button>
            )}

            <div className={styles.options}>
              <label>
                <input
                  type="checkbox"
                  checked={locationBackup}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setLocationBackup(checked);
                    if (!checked) setNativeForeground(false);
                  }}
                />
                <span>
                  <strong>{t("Follow my location (recommended)")}</strong>
                  <small>
                    {t(
                      "Times the alerts to where you really are, not only to the timetable. Your location stays on this phone and is forgotten when the ride ends."
                    )}
                  </small>
                </span>
              </label>

              {notificationsAvailable === "supported" && (
                <label>
                  <input
                    type="checkbox"
                    checked={notifications}
                    onChange={(event) => setNotifications(event.target.checked)}
                  />
                  <span>
                    <strong>{t("Also show notifications")}</strong>
                    <small>
                      {t(
                        "Only while this page is open. A locked phone often pauses it."
                      )}
                    </small>
                  </span>
                </label>
              )}
              {/* A browser that has blocked this site never asks again, so
                  ticking the box would promise a notification that cannot
                  come. Say so while it can still be changed. */}
              {notificationsAvailable === "supported" &&
                notifications &&
                globalThis.Notification?.permission === "denied" && (
                  <p className={styles.optionNote} role="status">
                    {t(
                      "Notifications are blocked. Allow them for this site in your browser settings."
                    )}
                  </p>
                )}
              {nativeAndroidBuild && (
                <label>
                  <input
                    type="checkbox"
                    checked={nativeForeground}
                    disabled={!locationBackup}
                    onChange={(event) =>
                      setNativeForeground(event.target.checked)
                    }
                  />
                  <span>
                    <strong>{t("Keep Ride Mode active on Android")}</strong>
                    <small>
                      {t(
                        "For this ride only, Android keeps a private persistent notification and a foreground location companion. Your route and location stay on this phone. This does not guarantee alerts on every locked phone."
                      )}
                    </small>
                  </span>
                </label>
              )}

              {notificationsAvailable === "home-screen-only" && (
                <p className={styles.optionNote}>
                  {vibrates
                    ? t(
                        "On iPhone, notifications need this app on your Home Screen (Share, then Add to Home Screen). Sound and vibration work here as long as this page stays open."
                      )
                    : t(
                        "On iPhone, notifications need this app on your Home Screen (Share, then Add to Home Screen). The alert sound works here as long as this page stays open, but this phone will not vibrate for it."
                      )}
                </p>
              )}
            </div>

            <div className={styles.safetyNote}>
              <strong>{t("Check your sound")}</strong>
              <span>
                {vibrates
                  ? t(
                      "Starting plays a test alert, so you can check the sound and vibration now. We only say “get off now” when live bus data or your location confirms it."
                    )
                  : t(
                      "Starting plays a test alert, so you can check the sound now; this phone will not vibrate for these alerts. We only say “get off now” when live bus data or your location confirms it."
                    )}
              </span>
            </div>

            <div ref={setActionsElement} className={styles.actions}>
              {startError && (
                <p className={styles.startError} role="alert">
                  {t(startError)}
                </p>
              )}

              <button
                type="button"
                className={styles.start}
                disabled={!targetStopSequence}
                onClick={start}
              >
                {t("Start get-off alert")}
              </button>
              {/* Greyed out with no word of why, the button read as broken:
                  until a stop is chosen, the line under it says so, short
                  enough not to grow the bar pinned to a phone's bottom. */}
              <span className={styles.departureContext}>
                {chosenStop
                  ? `${t("Get off at {name}", { name: optionName(chosenStop) })} · `
                  : `${t("Choose your stop first")} · `}
                {departureContext(arrival)}
              </span>
            </div>
          </>
        )}
    </section>
  );
}
