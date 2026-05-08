// End-to-end timing for the gather → score → message pipeline (no fs writes, no Slack post).
import { bench, describe } from "vitest";
import { gatherSignals } from "../signals.mjs";
import { scoreAll, computeTrends } from "../score.mjs";
import { buildSlackMessage } from "../slack.mjs";
import { makeRubric } from "../__tests__/_fixtures.mjs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const rubric = makeRubric();
const config = {
  user: { displayName: "Engineer" },
  slack: { channel: "#self-assessment", username: "Self-Assessment" },
  publish: { publicUrl: "http://localhost:3737" },
};

describe("end-to-end pipeline", () => {
  bench("gatherSignals + scoreAll + buildSlackMessage", async () => {
    const signals = await gatherSignals(ROOT);
    const scored = scoreAll(rubric, signals);
    const trends = computeTrends(scored, []);
    buildSlackMessage({ ...scored, trends, user: "Engineer" }, rubric, config);
  });
});
