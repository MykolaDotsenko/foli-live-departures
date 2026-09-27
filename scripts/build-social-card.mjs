// Keeps the generated brand artwork used for social sharing in sync with
// the public asset served by the PWA.
//
// The source image is intentionally versioned: it is a generated marketing
// visual, not a product screenshot. Real UI screenshots remain in docs/assets.
import { copyFile } from "node:fs/promises";

const PRODUCT_NAME = "Turku Departures";
const SOURCE = "docs/assets/turku-departures-social-card.jpg";
const DESTINATION = "public/social-card.jpg";

await copyFile(SOURCE, DESTINATION);
console.log(
  `wrote ${DESTINATION} from the generated ${PRODUCT_NAME} social artwork`
);
