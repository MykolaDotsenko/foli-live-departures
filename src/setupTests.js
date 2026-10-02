import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import fi from "./i18n/fi";
import uk from "./i18n/uk";
import { registerDictionary } from "./i18n";

registerDictionary("fi", fi);
registerDictionary("uk", uk);

afterEach(cleanup);
