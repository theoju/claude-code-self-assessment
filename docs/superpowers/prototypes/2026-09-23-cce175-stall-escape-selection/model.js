/* PROTOTYPE — throwaway. Pure model of one docs-agent night:
 * admission -> authoring -> deferral partition -> stall escape -> cursor advance.
 *
 * QUESTION: when the stall clock fires, which PR should be forgiven?
 * Mirrors scripts/orchestrator_runner.py at 13511b6c (post CCE-140/151/175/178).
 * No DOM. Liftable.
 */

// --- faithful port of advance_cursor_list (orchestrator_runner.py) ---
function advanceCursorList(admitted, deferredTail, heldBack) {
  const out = [];
  for (const n of [...admitted, ...deferredTail]) {
    if (heldBack.has(n)) break;
    out.push(n);
  }
  return out;
}

// --- faithful port of partition_deferrals (post CCE-178) ---
function partitionDeferrals(deferred, counts, threshold, forgive) {
  const skipped = [],
    still = [];
  for (const n of deferred) {
    const count = counts[n] || 0;
    if (count >= threshold || forgive.has(n)) skipped.push(n);
    else still.push(n);
  }
  return { skipped, still };
}

const STRATEGIES = {
  // A — what main does today. Scans `prs`, the POST-truncation admitted prefix.
  current: ({ prs, deferredNumbers }) =>
    prs.find((n) => deferredNumbers.has(n)) ?? null,

  // B — the one-word fix: scan the full window instead of the admitted prefix.
  windowScan: ({ windowPrs, deferredNumbers }) =>
    windowPrs.find((n) => deferredNumbers.has(n)) ?? null,

  // C — cursor-aware: same scan as B, but only forgive when the cursor is
  // genuinely stuck. If the prefix can already move, the escape is not needed.
  cursorAware: ({ windowPrs, deferredNumbers, wouldAdvanceUnforgiven }) =>
    wouldAdvanceUnforgiven
      ? null
      : (windowPrs.find((n) => deferredNumbers.has(n)) ?? null),

  // F — prefix-stuck: forgive ONLY when the unforgiven cursor prefix is empty,
  // i.e. the oldest window PR is itself held back. That is the one situation
  // forgiveness can fix. A prefix that is non-empty but refused by the CCE-109
  // SHA guards is a DIFFERENT problem; forgiving there costs a PR and buys
  // nothing, so it must emit a diagnostic instead of abandoning work.
  prefixStuck: ({ windowPrs, deferredNumbers, prefixEmpty }) =>
    prefixEmpty
      ? (windowPrs.find((n) => deferredNumbers.has(n)) ?? null)
      : null,
};

/**
 * @param {object} night
 *   windowPrs        number[]  full window, oldest first
 *   admittedCount    number    how many the admission gate reached (i)
 *   pagesFailed      number[]  admitted PRs whose page did not land
 *   baselineAgeDays  number
 *   stallDays        number
 *   threshold        number
 *   counts           {pr: n}
 * @param {'current'|'windowScan'|'cursorAware'} strategyName
 */
function runNight(night, strategyName) {
  const {
    admittedCount,
    pagesFailed,
    baselineAgeDays,
    stallDays,
    threshold,
    counts,
  } = night;

  // CCE-169: bound the derived window to the oldest N PRs so a run always
  // faces a drainable amount of work. Everything past the cap is not in this
  // run's window at all — not deferred, not held back, not counted.
  const windowPrs = night.windowCap
    ? night.windowPrs.slice(0, night.windowCap)
    : night.windowPrs;

  const prs = windowPrs.slice(0, admittedCount); // post-truncation
  const admissionDeferred = windowPrs.slice(admittedCount);
  const timeTruncated = admissionDeferred.length > 0;

  // complement writer: only admitted PRs can owe pages
  const deferredPagesByPr = pagesFailed.filter((n) => prs.includes(n));

  // _deferred_all = admission_deferred ++ (deferred_pages_by_pr INTERSECT pr_by_number)
  const prByNumber = new Set(prs);
  const deferredAll = [
    ...admissionDeferred,
    ...deferredPagesByPr.filter((n) => prByNumber.has(n)),
  ];
  const deferredNumbers = new Set(deferredAll);

  const stalled = stallDays > 0 && baselineAgeDays >= stallDays;

  // what the cursor would do with NO forgiveness at all (input to strategy C).
  // `advanceRefused` models the CCE-109 guards that can reject a computed
  // cursor (unanchorable merge_sha, non-forward SHA, unreachable from HEAD) —
  // a prefix can be non-empty and STILL not move the baseline.
  const heldBackUnforgiven = new Set([
    ...deferredPagesByPr,
    ...admissionDeferred,
  ]);
  const unforgivenPrefix = advanceCursorList(
    prs,
    admissionDeferred,
    heldBackUnforgiven,
  );
  const prefixEmpty = unforgivenPrefix.length === 0;
  const wouldAdvanceUnforgiven = !prefixEmpty && !night.advanceRefused;

  const blocker = STRATEGIES[strategyName]({
    prs,
    windowPrs,
    deferredNumbers,
    wouldAdvanceUnforgiven,
    prefixEmpty,
  });
  const forgive = new Set(stalled && blocker !== null ? [blocker] : []);

  const { skipped, still } = partitionDeferrals(
    deferredAll,
    counts,
    threshold,
    forgive,
  );
  const skippedSet = new Set(skipped);

  const heldBack = new Set(
    [...deferredPagesByPr, ...admissionDeferred].filter(
      (n) => !skippedSet.has(n),
    ),
  );

  const cursorPrs =
    timeTruncated || heldBack.size > 0
      ? advanceCursorList(prs, admissionDeferred, heldBack)
      : [...prs];

  const advanced = cursorPrs.length > 0 && !night.advanceRefused;

  return {
    admitted: prs,
    admissionDeferred,
    pagesOwed: deferredPagesByPr,
    stalled,
    blocker,
    forgiven: [...forgive],
    skipped,
    stillDeferred: still,
    heldBack: [...heldBack].sort((a, b) => a - b),
    cursorReaches: advanced ? cursorPrs[cursorPrs.length - 1] : null,
    baselineMoved: advanced,
    // `if _forgive:` guards the deferral_stall_escape reason in the real code
    escapeReasonEmitted: forgive.size > 0,
    // the silent-freeze signature this prototype exists to find
    silentFreeze: stalled && !advanced && forgive.size === 0,
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    runNight,
    advanceCursorList,
    partitionDeferrals,
    STRATEGIES,
  };
}
