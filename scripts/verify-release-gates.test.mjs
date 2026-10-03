import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPECTED_RELEASE_GATES,
  RELEASE_GATE_PROFILES,
  assertReleaseGates,
  validateReleaseGates,
} from "./verify-release-gates.mjs";

function ledger(overrides = {}) {
  const statusById = overrides.statusById || {};
  return {
    schema: 1,
    gates: EXPECTED_RELEASE_GATES.map((id) => {
      const closed = statusById[id] === "closed";
      return {
        id,
        status: closed ? "closed" : "open",
        completedAt: closed ? "2026-10-03" : null,
        evidence: closed ? [`evidence:${id}`] : [],
      };
    }),
  };
}

test("structural verification allows honest open manual gates", () => {
  const result = assertReleaseGates(ledger(), {
    productionConfig: { customDomain: null },
  });
  assert.equal(result.open.length, EXPECTED_RELEASE_GATES.length);
  assert.equal(result.closed.length, 0);
});

test("android publish profile requires only A08/A09 manual evidence", () => {
  assert.deepEqual(RELEASE_GATE_PROFILES["android-publish"], [
    "android-production-signing",
    "physical-android-lifecycle",
    "android-physical-upgrade",
  ]);

  assert.throws(
    () =>
      assertReleaseGates(ledger(), {
        productionConfig: { customDomain: null },
        requiredProfile: "android-publish",
      }),
    /android-production-signing/
  );

  const result = assertReleaseGates(
    ledger({
      statusById: Object.fromEntries(
        RELEASE_GATE_PROFILES["android-publish"].map((id) => [id, "closed"])
      ),
    }),
    {
      productionConfig: { customDomain: null },
      requiredProfile: "android-publish",
    }
  );
  assert.deepEqual(result.required, RELEASE_GATE_PROFILES["android-publish"]);
});

test("public promotion stays blocked by broader manual launch evidence", () => {
  const result = validateReleaseGates(ledger(), {
    productionConfig: { customDomain: null },
    requiredProfile: "public-promotion",
  });
  assert.ok(
    result.failures.some((failure) =>
      failure.includes("native-finnish-review")
    )
  );
  assert.ok(
    result.failures.some((failure) =>
      failure.includes("real-bus-validation")
    )
  );
  assert.ok(
    result.failures.some((failure) =>
      failure.includes("custom-domain")
    )
  );
});

test("closed gates require real dates and evidence while open gates cannot fake evidence", () => {
  const payload = ledger();
  payload.gates[0] = {
    id: payload.gates[0].id,
    status: "closed",
    completedAt: "2026-02-31",
    evidence: [],
  };
  payload.gates[1] = {
    ...payload.gates[1],
    evidence: ["premature claim"],
  };

  const result = validateReleaseGates(payload, {
    productionConfig: { customDomain: null },
  });
  assert.ok(result.failures.some((failure) => failure.includes("real YYYY-MM-DD")));
  assert.ok(result.failures.some((failure) => failure.includes("explicit evidence")));
  assert.ok(result.failures.some((failure) => failure.includes("open gate cannot claim")));
});

test("custom-domain closure still requires an actual configured domain", () => {
  const payload = ledger({
    statusById: { "custom-domain": "closed" },
  });
  assert.throws(
    () =>
      assertReleaseGates(payload, {
        productionConfig: { customDomain: null },
      }),
    /cannot be closed/
  );
});
