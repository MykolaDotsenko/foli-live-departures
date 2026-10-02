const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function encodeCssModuleIndex(index) {
  let value = Number(index);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("CSS module index must be a non-negative safe integer.");
  }

  let encoded = "";
  do {
    encoded = ALPHABET[value % ALPHABET.length] + encoded;
    value = Math.floor(value / ALPHABET.length) - 1;
  } while (value >= 0);

  return encoded;
}

export function createCssModuleScopedNameGenerator(prefix = "_") {
  const byIdentity = new Map();
  let nextIndex = 0;

  return (localName, filename) => {
    const identity = `${String(filename || "")}\0${String(localName || "")}`;
    const existing = byIdentity.get(identity);
    if (existing) return existing;

    const scoped = `${prefix}${encodeCssModuleIndex(nextIndex)}`;
    nextIndex += 1;
    byIdentity.set(identity, scoped);
    return scoped;
  };
}
