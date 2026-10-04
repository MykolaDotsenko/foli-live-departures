import { beforeEach, expect, test, vi } from "vitest";
import {
  loadAddressPack,
  parseAddressPack,
  resetAddressPackForTests,
} from "./addressPack";

const raw = {
  addressFields: ["street", "house", "lat", "lon", "city"],
  streetFields: ["street", "lat", "lon", "city"],
  addresses: [
    ["Tampereentie", "12", 60.45, 22.26, "Turku"],
    ["Linnankatu", "80", 60.435, 22.229, "Turku"],
  ],
  streets: [
    ["Linnankatu", 60.445, 22.25, "Turku"],
    ["Tampereentie", 60.47, 22.27, "Turku"],
  ],
};

beforeEach(() => {
  resetAddressPackForTests();
  vi.restoreAllMocks();
});

test("parses compact address and street rows into searchable records", () => {
  const pack = parseAddressPack(raw);
  expect(pack.addresses[0]).toMatchObject({
    kind: "address",
    title: "Tampereentie 12",
    streetKey: "tampereentie",
    addressKey: "tampereentie 12",
  });
  expect(pack.streets[0]).toMatchObject({
    kind: "street",
    title: "Linnankatu",
    streetKey: "linnankatu",
  });
});

test("rejects an unknown pack field layout", () => {
  expect(parseAddressPack({ ...raw, addressFields: ["oops"] })).toEqual({
    addresses: [],
    streets: [],
  });
});

test("loads once from the same-origin shipped pack", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue({ ok: true, json: async () => raw });
  const first = await loadAddressPack();
  const second = await loadAddressPack();
  expect(first.addresses).toHaveLength(2);
  expect(second).toBe(first);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toMatch(/addresses\/foli-addresses\.json$/);
});
