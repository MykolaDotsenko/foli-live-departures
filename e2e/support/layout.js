// Screen conditions a passenger brings: 200% text, and a phone's folded service updates.

// Browser text zoom, as a passenger with large text has it. Through the
// CSSOM rather than an injected <style>, which the page's policy refuses.
export async function scaleTextTo200Percent(page) {
  await page.evaluate(() => {
    document.documentElement.style.setProperty("font-size", "200%", "important");
  });
}

// On a phone the service updates fold into one line; this opens them.
export async function openServiceUpdates(page) {
  await page.locator("#service-alerts-list").waitFor({ state: "attached" });
  const fold = page.locator('[aria-controls="service-alerts-list"]');
  if (await fold.isVisible()) await fold.click();
}
