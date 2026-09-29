// Saved and shared places: the stop catalogue, a seeded Home, and share tokens.

export function encodeSharedPlaceForTest(payload) {
  const bytes = new globalThis.TextEncoder().encode(JSON.stringify(payload));
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return globalThis
    .btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

export async function seedHome(page, { primaryStopId = "164" } = {}) {
  await page.evaluate((primary) => {
    localStorage.setItem(
      "foli-stop-catalog-v2",
      JSON.stringify({
        savedAt: Date.now(),
        stops: [
          {
            id: "164",
            name: "Kauppatori",
            lat: 60.4518,
            lon: 22.2666,
          },
          {
            id: "32",
            name: "Puistokatu",
            lat: 60.4488,
            lon: 22.255,
          },
          {
            id: "4",
            name: "Turun linna",
            lat: 60.4355,
            lon: 22.2345,
          },
        ],
      })
    );
    localStorage.setItem(
      "foli-my-places-v1",
      JSON.stringify([
        {
          id: "home",
          label: "Home",
          icon: "⌂",
          primaryStopId: primary,
          stops: [
            { id: "164", name: "Kauppatori" },
            { id: "32", name: "Puistokatu" },
          ],
          updatedAt: 1,
        },
      ])
    );
  }, primaryStopId);
  await page.reload();
}
