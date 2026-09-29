import { afterEach, expect, test, vi } from "vitest";
import { offerPlaceLink } from "./sharePlace";

const place = { id: "school", primaryStopId: "4", stops: [{ id: "4", name: "Turun linna" }] };
const url = "https://example.test/#place=abc";
const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

function setNavigator(key, value) {
  Object.defineProperty(navigator, key, { configurable: true, value });
}

afterEach(() => {
  for (const [key, original] of [["share", originalShare], ["clipboard", originalClipboard]]) {
    if (original) Object.defineProperty(navigator, key, original);
    else delete navigator[key];
  }
});

test("uses the phone's share sheet where there is one", async () => {
  const share = vi.fn().mockResolvedValue();
  setNavigator("share", share);

  expect(await offerPlaceLink({ url, place, label: "School" })).toEqual({
    feedback: "Link shared.",
    url: "",
  });
  expect(share).toHaveBeenCalledWith({
    title: "School · My Places",
    text: "Add School to My Places",
    url,
  });
});

// Closing the share sheet is the passenger's choice, not a failure to
// report.
test("says nothing when the passenger closes the share sheet", async () => {
  setNavigator("share", vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" })));

  expect(await offerPlaceLink({ url, place, label: "School" })).toBeNull();
});

test("copies the link where there is no share sheet", async () => {
  delete navigator.share;
  const writeText = vi.fn().mockResolvedValue();
  setNavigator("clipboard", { writeText });

  expect(await offerPlaceLink({ url, place, label: "School" })).toEqual({
    feedback: "Share link copied.",
    url: "",
  });
  expect(writeText).toHaveBeenCalledWith(url);
});

test("shows the link to copy by hand when sharing and copying both fail", async () => {
  setNavigator("share", vi.fn().mockRejectedValue(new Error("NotAllowedError")));

  expect(await offerPlaceLink({ url, place, label: "School" })).toEqual({
    feedback: "Copy the share link below.",
    url,
  });

  delete navigator.share;
  setNavigator("clipboard", undefined);
  expect(await offerPlaceLink({ url, place, label: "School" })).toEqual({
    feedback: "Copy the share link below.",
    url,
  });
});
