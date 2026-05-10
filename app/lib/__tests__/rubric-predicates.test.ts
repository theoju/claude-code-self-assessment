import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluatePredicate } from "../assessment";

// Sweep guard: walks every action.satisfiedWhen in rubric.json and asserts
// the predicate parses against a known-good "all-satisfied" signalsSummary.
// Catches typos that would otherwise silently return false forever (e.g.
// `allowListCount>=` with no RHS, or a renamed signalsSummary field that
// no longer matches the rubric).

const rubric = JSON.parse(
  readFileSync(join(process.cwd(), "app", "data", "rubric.json"), "utf8"),
) as {
  dimensions: Array<{
    id: string;
    nextActions: Array<{ id: string; satisfiedWhen?: string }>;
  }>;
};

// Fixture deliberately satisfies every predicate currently in the rubric.
// Adding a new predicate that references a different field will fail this
// sweep until the fixture is updated — that's the point.
const ALL_SATISFIED_SIGNALS = {
  // permissions
  skipDangerous: false,
  allowListCount: 38,
  hasWildcardAllow: true,
  // automation
  hasShipCommand: true,
  hasVerifyAgent: true,
  hasStopHook: true,
  hasPostToolHook: true,
  hasFormatterHook: true,
  hasStopHookNotification: true,
  hasIsolatedAgent: true,
  // model-effort
  effortLevel: "max",
  autoCompactWindow: "400000",
  // customization
  hasCustomSpinnerVerbs: true,
  // memory
  claudeMdExists: true,
  // integrations
  hasSlackPlugin: true,
  hasVercelPlugin: true,
  hasClaudeInChrome: true,
  mcpServersConnected: 5,
  // counts
  plugins: 33,
  personalSkills: 2,
  hookTotalCount: 4,
};

describe("rubric satisfiedWhen predicates", () => {
  const allActions = rubric.dimensions.flatMap((d) =>
    d.nextActions.map((a) => ({ ...a, dim: d.id })),
  );
  const predicated = allActions.filter((a) => a.satisfiedWhen);

  it("includes at least one predicated action (regression guard)", () => {
    expect(predicated.length).toBeGreaterThan(0);
  });

  it("every satisfiedWhen resolves to true against an all-satisfied fixture", () => {
    const failures: Array<{ id: string; predicate: string }> = [];
    for (const a of predicated) {
      const ok = evaluatePredicate(a.satisfiedWhen!, ALL_SATISFIED_SIGNALS);
      if (!ok)
        failures.push({ id: `${a.dim}/${a.id}`, predicate: a.satisfiedWhen! });
    }
    expect(failures).toEqual([]);
  });

  it("every satisfiedWhen resolves to false against an empty fixture (no false positives)", () => {
    const accidentalTruths: Array<{ id: string; predicate: string }> = [];
    for (const a of predicated) {
      // Negation-only predicates (e.g. "!skipDangerous") will be true against
      // {} — that's intended behavior, not a bug. Skip those for this assertion.
      if (a.satisfiedWhen!.trim().startsWith("!")) continue;
      const ok = evaluatePredicate(a.satisfiedWhen!, {});
      if (ok)
        accidentalTruths.push({
          id: `${a.dim}/${a.id}`,
          predicate: a.satisfiedWhen!,
        });
    }
    expect(accidentalTruths).toEqual([]);
  });
});
