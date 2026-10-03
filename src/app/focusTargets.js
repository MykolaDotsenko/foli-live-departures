// Where keyboard and screen-reader focus goes when the control a passenger
// pressed leaves the page. Each returns the element, or null while it is
// not drawn yet (usePendingFocus asks again on the next render).

// The page's one h1: the stop's name on the board, or the app's own name
// before a stop is open. It is where focus goes when the button pressed
// has gone and the page itself is the answer.
export function pageHeading() {
  return (
    document.getElementById("departures-title") ||
    document.getElementById("app-title")
  );
}

// A saved place's card, by its first control a passenger can reach. The
// shared-place question is answered from a card that then leaves the page.
export function placeCardControl(placeId) {
  const card = document.querySelector(
    `[aria-labelledby="my-places-title"] [data-place="${placeId}"]`
  );
  if (!card) return pageHeading();
  const controls = [...card.querySelectorAll("a[href], button:not(:disabled)")];
  const shown = controls.find((control) =>
    typeof control.checkVisibility === "function"
      ? control.checkVisibility()
      : control.getClientRects().length > 0
  );
  return shown || controls[0] || pageHeading();
}

export function nearbyHeading() {
  return document.getElementById("nearby-stops-title");
}

export function rideHeading() {
  return document.getElementById("ride-mode-title");
}

export function activeJourneyHeading() {
  return document.getElementById("active-journey-title");
}

export function finalWalkHeading() {
  return document.getElementById("final-walk-title");
}

export function recoveryJourneyTarget() {
  const option = document.querySelector(
    '[aria-labelledby="recovery-journey-options-title"] button, [aria-labelledby="recovery-transfer-journey-options-title"] button'
  );
  if (option instanceof globalThis.HTMLElement) return option;
  return (
    document.getElementById("recovery-journey-options-title") ||
    document.getElementById("recovery-transfer-journey-options-title")
  );
}

export function selectedJourneyDepartureAction() {
  return (
    document.getElementById("selected-journey-departure-action") ||
    pageHeading()
  );
}

export function firstJourneyOption() {
  const element = document.querySelector(
    '[aria-labelledby="recovery-journey-options-title"] button, [aria-labelledby="recovery-transfer-journey-options-title"] button, [aria-labelledby="direct-journey-options-title"] button, [aria-labelledby="transfer-journey-options-title"] button'
  );
  return element instanceof globalThis.HTMLElement ? element : null;
}
