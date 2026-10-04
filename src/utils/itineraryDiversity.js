/**
 * Preserve the already-ranked best option, then prefer genuinely different
 * transit shapes before filling remaining slots. This prevents the UI from
 * presenting three near-identical departures of the same line sequence as
 * if they were three meaningful choices.
 *
 * Ranking stays authoritative: this function never reorders within the
 * "same level of diversity"; it only performs a stable distinct-first pass.
 *
 * @param {readonly any[]} ranked
 * @param {number} [limit]
 */
export function selectDiverseItineraries(ranked, limit = 3) {
  const rows = Array.isArray(ranked) ? ranked.filter(Boolean) : [];
  const max = Math.max(0, Math.floor(Number(limit) || 0));
  if (max === 0 || rows.length === 0) return [];

  const signature = (option) => {
    const legs = Array.isArray(option?.legs)
      ? option.legs
      : [option?.first, option?.second].filter(Boolean);
    const transfers = Array.isArray(option?.transfers)
      ? option.transfers
      : option?.transfer
        ? [option.transfer]
        : [];
    return [
      String(option?.originStopId || ""),
      legs.map((leg) => String(leg?.lineRef || "—")).join(">"),
      transfers
        .map((item) =>
          [
            String(item?.alightStopId || ""),
            String(item?.boardStopId || ""),
          ].join(">")
        )
        .join("|"),
    ].join("::");
  };

  const selected = [];
  const used = new Set();

  for (const option of rows) {
    const key = signature(option);
    if (used.has(key)) continue;
    selected.push(option);
    used.add(key);
    if (selected.length >= max) return selected;
  }

  // If the network only offers one transit shape, keep useful later
  // departures rather than returning fewer cards.
  for (const option of rows) {
    if (selected.includes(option)) continue;
    selected.push(option);
    if (selected.length >= max) break;
  }

  return selected;
}
