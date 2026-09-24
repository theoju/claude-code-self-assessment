/* PROTOTYPE harness — throwaway. Runs each scenario through all 3 strategies. */
const { runNight } = require("./model.js");

const BASE = { stallDays: 4, threshold: 3, counts: {} };
const W = [219, 220, 221, 222, 223, 224, 225, 226, 227, 228];

const SCENARIOS = [
  {
    name: "1. Real 2026-09-22 night — oldest admitted PR owes a page",
    night: { ...BASE, windowPrs: [221, 222, 223, 224], admittedCount: 4,
             pagesFailed: [221], baselineAgeDays: 31.2 },
    want: "forgive 221, baseline moves",
  },
  {
    name: "2. Budget exhausted before admitting ANY PR (i == 0)",
    night: { ...BASE, windowPrs: W, admittedCount: 0,
             pagesFailed: [], baselineAgeDays: 31.2 },
    want: "forgive 219, baseline moves, reason emitted",
  },
  {
    name: "3. Healthy truncation, clock NOT stalled",
    night: { ...BASE, windowPrs: W, admittedCount: 5,
             pagesFailed: [], baselineAgeDays: 1.0 },
    want: "forgive nothing, cursor reaches 223",
  },
  {
    name: "4. Stalled, but admitted prefix is CLEAN (tail deferred only)",
    night: { ...BASE, windowPrs: W, admittedCount: 5,
             pagesFailed: [], baselineAgeDays: 31.2 },
    want: "forgive NOTHING — cursor can already move to 223",
  },
  {
    name: "5. Stalled, oldest admitted owes a page, tail also deferred",
    night: { ...BASE, windowPrs: W, admittedCount: 5,
             pagesFailed: [219], baselineAgeDays: 31.2 },
    want: "forgive 219 only",
  },
  {
    name: "6. Stalled, prefix looks advanceable but CCE-109 refuses the advance",
    night: { ...BASE, windowPrs: W, admittedCount: 5,
             pagesFailed: [], baselineAgeDays: 31.2, advanceRefused: true },
    want: "forgive something — baseline is NOT moving despite a non-empty prefix",
  },
];

const STRATS = ["current", "windowScan", "cursorAware", "prefixStuck"];
const pad = (s, n) => String(s).padEnd(n);

for (const { name, night, want } of SCENARIOS) {
  console.log("\n" + "=".repeat(78));
  console.log(name);
  console.log("  want: " + want);
  console.log("  " + pad("strategy", 13) + pad("blocker", 9) + pad("forgiven", 11) +
              pad("held_back", 22) + pad("cursor", 8) + "verdict");
  for (const s of STRATS) {
    const r = runNight(night, s);
    const verdict = r.silentFreeze
      ? "SILENT FREEZE"
      : r.baselineMoved
        ? (r.forgiven.length ? `moved (abandoned ${r.forgiven})` : "moved, nothing lost")
        : "frozen (reason emitted)";
    console.log("  " + pad(s, 13) + pad(r.blocker ?? "none", 9) +
                pad(JSON.stringify(r.forgiven), 11) +
                pad(JSON.stringify(r.heldBack), 22) +
                pad(r.cursorReaches ?? "—", 8) + verdict);
  }
}
console.log("");
