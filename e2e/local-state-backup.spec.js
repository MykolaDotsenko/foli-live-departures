import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./support/test.js";
import { scaleTextTo200Percent } from "./support/layout.js";

const BACKUP_KIND = "turku-departures-local-state";

async function openBackup(page) {
  const about = page.locator("footer details.about");
  await about.getByText("About & privacy", { exact: true }).click();
  await expect(
    about.getByRole("heading", { name: "Backup & transfer" })
  ).toBeVisible();
  return about;
}

test("local-state backup exports only portable data and imports only after preview confirmation", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.addInitScript(() => {
    localStorage.setItem(
      "foli-my-places-v1",
      JSON.stringify([
        {
          id: "home",
          label: "Home",
          stops: [{ id: "164", name: "Kauppatori" }],
          primaryStopId: "164",
          updatedAt: 1000,
        },
      ])
    );
    localStorage.setItem(
      "foli-saved-stops-v1",
      JSON.stringify({
        favorites: [{ id: "32", name: "Puistokatu" }],
        recents: [
          { id: "999", name: "PRIVATE RECENT SENTINEL", viewedAt: 1000 },
        ],
      })
    );
    localStorage.setItem(
      "foli-line-filter-v1",
      JSON.stringify({
        164: { lines: ["1", "32"], savedAt: 1000 },
      })
    );
  });

  await page.goto("/");
  const about = await openBackup(page);

  // Seed transient/private state after boot so it cannot change the screen;
  // the exporter must still ignore it because it is whitelist-only.
  await page.evaluate(() => {
    localStorage.setItem(
      "foli-active-ride-v1",
      JSON.stringify({
        latitude: 60.4518,
        longitude: 22.2666,
        marker: "PRIVATE RIDE SENTINEL",
      })
    );
    localStorage.setItem(
      "foli-active-journey-v1",
      JSON.stringify({ marker: "PRIVATE JOURNEY SENTINEL" })
    );
  });

  const downloadPromise = page.waitForEvent("download");
  await about.getByRole("button", { name: "Download backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^turku-departures-backup-\d{4}-\d{2}-\d{2}\.json$/
  );

  const path = await download.path();
  expect(path).toBeTruthy();
  const text = fs.readFileSync(path, "utf8");
  const payload = JSON.parse(text);

  expect(payload.kind).toBe(BACKUP_KIND);
  expect(payload.version).toBe(1);
  expect(payload.data.places[0]).toMatchObject({
    id: "home",
    primaryStopId: "164",
  });
  expect(payload.data.favorites).toEqual([
    { id: "32", name: "Puistokatu" },
  ]);
  expect(payload.data.lineFilters).toEqual([
    { stopId: "164", lines: ["1", "32"], savedAt: 1000 },
  ]);
  expect(text).not.toContain("PRIVATE RECENT SENTINEL");
  expect(text).not.toContain("PRIVATE RIDE SENTINEL");
  expect(text).not.toContain("PRIVATE JOURNEY SENTINEL");
  expect(text).not.toContain("latitude");
  expect(text).not.toContain("longitude");

  // Simulate the new origin: clear only portable keys. Transient state is
  // deliberately unrelated to the import and remains untouched.
  await page.evaluate(() => {
    for (const key of [
      "foli-my-places-v1",
      "foli-saved-stops-v1",
      "foli-line-filter-v1",
    ]) {
      localStorage.removeItem(key);
    }
  });

  const fileInput = about.getByLabel("Backup file");
  await fileInput.setInputFiles({
    name: "turku-departures-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });

  await expect(
    about.getByRole("heading", { name: "What this backup can add" })
  ).toBeVisible();

  // Preview is read-only until the passenger confirms.
  expect(
    await page.evaluate(() => localStorage.getItem("foli-my-places-v1"))
  ).toBeNull();

  const a11y = await new AxeBuilder({ page })
    .include('section[aria-labelledby="local-state-backup-title"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(a11y.violations).toEqual([]);

  await about.getByRole("button", { name: "Import this backup" }).click();

  await expect(about.getByRole("status")).toContainText("Backup imported");
  const restored = await page.evaluate(() => ({
    places: JSON.parse(localStorage.getItem("foli-my-places-v1")),
    savedStops: JSON.parse(localStorage.getItem("foli-saved-stops-v1")),
    filters: JSON.parse(localStorage.getItem("foli-line-filter-v1")),
    ride: localStorage.getItem("foli-active-ride-v1"),
  }));

  expect(restored.places[0].primaryStopId).toBe("164");
  expect(restored.savedStops.favorites).toEqual([
    { id: "32", name: "Puistokatu" },
  ]);
  expect(restored.savedStops.recents).toEqual([]);
  expect(restored.filters["164"].lines).toEqual(["1", "32"]);
  expect(restored.ride).toContain("PRIVATE RIDE SENTINEL");
});

test("backup preview reflows at 320px and 200 percent text", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await scaleTextTo200Percent(page);
  const about = await openBackup(page);

  await about.getByLabel("Backup file").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        kind: BACKUP_KIND,
        version: 1,
        data: {
          places: [
            {
              id: "home",
              stops: [
                { id: "164", name: "Kauppatori" },
                { id: "32", name: "Puistokatu" },
              ],
              primaryStopId: "164",
              updatedAt: Date.now() - 1000,
            },
          ],
          favorites: [{ id: "4", name: "Turun linna" }],
          lineFilters: [
            {
              stopId: "164",
              lines: ["1", "32"],
              savedAt: Date.now() - 1000,
            },
          ],
          preferences: { language: null, theme: null },
        },
      })
    ),
  });

  await expect(
    about.getByRole("heading", { name: "What this backup can add" })
  ).toBeVisible();
  for (const button of [
    about.getByRole("button", { name: "Download backup" }),
    about.getByRole("button", { name: "Choose backup file" }),
    about.getByRole("button", { name: "Import this backup" }),
    about.getByRole("button", { name: "Cancel import" }),
  ]) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(321);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
