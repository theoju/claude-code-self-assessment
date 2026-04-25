import { bench, describe } from "vitest";
import { SCORERS, scoreAll } from "../score.mjs";
import { makeSignals, makeRubric } from "../__tests__/_fixtures.mjs";

const signals = makeSignals({
  settings: { effortLevel: "xhigh", hookTotalCount: 3, hookEvents: ["PostToolUse", "Stop", "SessionStart"] },
  personalAgents: ["a.md", "b.md"],
  personalCommands: ["go.md", "ship.md"],
  personalSkills: ["s1", "s2"],
  plugins: Array.from({ length: 25 }, (_, i) => `p${i}@1`),
  memory: [{ project: "x", fileCount: 3 }],
  has: { superpowers: true, playwright: true, imessage: true, karpathy: true, explanatoryStyle: true },
});
const rubric = makeRubric();

describe("scorer hot paths", () => {
  for (const id of Object.keys(SCORERS)) {
    bench(`SCORERS.${id}`, () => {
      SCORERS[id](signals);
    });
  }
  bench("scoreAll (full rubric)", () => {
    scoreAll(rubric, signals);
  });
});
