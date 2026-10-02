import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createCssModuleScopedNameGenerator,
  encodeCssModuleIndex,
} from "./css-module-names.mjs";

test("encodes indices as short valid alphabetic CSS suffixes", () => {
  assert.equal(encodeCssModuleIndex(0), "a");
  assert.equal(encodeCssModuleIndex(51), "Z");
  assert.equal(encodeCssModuleIndex(52), "aa");
  assert.equal(encodeCssModuleIndex(53), "ab");
  assert.throws(() => encodeCssModuleIndex(-1), /non-negative/);
});

test("assigns stable unique names to every module identity", () => {
  const scoped = createCssModuleScopedNameGenerator();
  const names = new Set();

  for (let index = 0; index < 1000; index += 1) {
    const name = scoped(`class-${index}`, `/module-${index % 17}.css`);
    assert.match(name, /^[A-Za-z]+$/);
    assert.equal(names.has(name), false);
    names.add(name);
    assert.equal(
      scoped(`class-${index}`, `/module-${index % 17}.css`),
      name
    );
  }

  assert.equal(names.size, 1000);
});

test("generated module names do not collide with global App.css classes", async () => {
  const css = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  const globalClasses = new Set(
    [...css.matchAll(/\.([_A-Za-z][_A-Za-z0-9-]*)/g)].map((match) => match[1])
  );
  const scoped = createCssModuleScopedNameGenerator();
  for (let index = 0; index < 2000; index += 1) {
    const name = scoped(`class-${index}`, `/module-${index % 97}.css`);
    assert.equal(
      globalClasses.has(name),
      false,
      `Generated CSS Module name collides with global class .${name}`
    );
  }
});
