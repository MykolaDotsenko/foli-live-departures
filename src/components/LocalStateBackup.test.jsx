import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import LocalStateBackup from "./LocalStateBackup";
import {
  BACKUP_KIND,
  BACKUP_VERSION,
  LOCAL_STATE_KEYS,
} from "../utils/localStateBackup";
import { resetLanguageForTests, setLanguage } from "../i18n";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  localStorage.clear();
  resetLanguageForTests("en");
  URL.createObjectURL = vi.fn(() => "blob:backup");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  resetLanguageForTests("en");
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  vi.restoreAllMocks();
});

test("downloads only the privacy-safe backup surface", () => {
  localStorage.setItem(
    LOCAL_STATE_KEYS.savedStops,
    JSON.stringify({
      favorites: [{ id: "164", name: "Kauppatori" }],
      recents: [{ id: "999", name: "Private recent sentinel", viewedAt: 1 }],
    })
  );
  localStorage.setItem(
    "foli-active-ride-v1",
    JSON.stringify({ latitude: 60.45, secret: "ride sentinel" })
  );

  let downloaded = null;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
    downloaded = this.download;
  });

  render(<LocalStateBackup />);
  fireEvent.click(screen.getByRole("button", { name: "Download backup" }));

  expect(downloaded).toMatch(/^turku-departures-backup-\d{4}-\d{2}-\d{2}\.json$/);
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  expect(
    screen.getByText(/never recent stops, GPS or ride history/i)
  ).toBeInTheDocument();
});

test("shows a review before import and only applies after explicit confirmation", async () => {
  const backup = {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    data: {
      places: [
        {
          id: "home",
          stops: [{ id: "164", name: "Kauppatori" }],
          primaryStopId: "164",
          updatedAt: Date.now() - 1000,
        },
      ],
      favorites: [{ id: "32", name: "Puistokatu" }],
      lineFilters: [
        { stopId: "164", lines: ["1"], savedAt: Date.now() - 1000 },
      ],
      preferences: { language: null, theme: null },
    },
  };

  render(<LocalStateBackup />);
  const input = screen.getByLabelText("Backup file");
  fireEvent.change(input, {
    target: {
      files: [
        new File([JSON.stringify(backup)], "backup.json", {
          type: "application/json",
        }),
      ],
    },
  });

  expect(
    await screen.findByRole("heading", { name: "What this backup can add" })
  ).toBeInTheDocument();
  expect(localStorage.getItem(LOCAL_STATE_KEYS.places)).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Import this backup" }));

  await waitFor(() =>
    expect(
      JSON.parse(localStorage.getItem(LOCAL_STATE_KEYS.places))[0].primaryStopId
    ).toBe("164")
  );
  expect(
    JSON.parse(localStorage.getItem(LOCAL_STATE_KEYS.savedStops)).favorites
  ).toEqual([{ id: "32", name: "Puistokatu" }]);
  expect(screen.getByRole("status")).toHaveTextContent("Backup imported");
});

test("invalid input fails closed without changing current local state", async () => {
  localStorage.setItem(
    LOCAL_STATE_KEYS.savedStops,
    JSON.stringify({ favorites: [{ id: "10", name: "Keep" }], recents: [] })
  );

  render(<LocalStateBackup />);
  fireEvent.change(screen.getByLabelText("Backup file"), {
    target: {
      files: [new File(["not json"], "broken.json", { type: "application/json" })],
    },
  });

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This is not a Turku Departures backup file"
  );
  expect(JSON.parse(localStorage.getItem(LOCAL_STATE_KEYS.savedStops))).toEqual({
    favorites: [{ id: "10", name: "Keep" }],
    recents: [],
  });
});

test("the full backup flow follows Finnish immediately", () => {
  render(<LocalStateBackup />);
  setLanguage("fi");

  expect(
    screen.getByRole("heading", { name: "Varmuuskopio ja siirto" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Lataa varmuuskopio" })
  ).toBeInTheDocument();
});
