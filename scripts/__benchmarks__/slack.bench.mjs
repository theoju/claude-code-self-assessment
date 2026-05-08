import { bench, describe } from "vitest";
import { buildSlackMessage } from "../slack.mjs";
import { makeAssessment, makeRubric } from "../__tests__/_fixtures.mjs";

const assessment = makeAssessment();
const rubric = makeRubric();
const config = {
  user: { displayName: "Engineer" },
  slack: { channel: "#self-assessment", username: "Self-Assessment", iconEmoji: ":chart:" },
  publish: { publicUrl: "http://localhost:3737" },
};

describe("slack message rendering", () => {
  bench("buildSlackMessage", () => {
    buildSlackMessage(assessment, rubric, config);
  });
});
