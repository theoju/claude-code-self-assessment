// Reusable test fixtures for the scoring engine.
// Each helper returns a fresh object so tests can mutate without cross-talk.

export function makeSignals(overrides = {}) {
  const base = {
    capturedAt: "2026-04-25T07:15:00.000Z",
    settings: {
      effortLevel: "unknown",
      skipDangerousModePermissionPrompt: false,
      allowList: [],
      denyList: [],
      autoCompactWindow: null,
      hookEvents: [],
      hookTotalCount: 0,
    },
    personalAgents: [],
    personalCommands: [],
    personalSkills: [],
    projectAgents: [],
    projectCommands: [],
    plugins: [],
    memory: [],
    claudeMdExists: false,
    plansCount: 0,
    sessionsCount: 0,
    statuslineConfigured: false,
    keybindingsConfigured: false,
    hasClaudeInChrome: false,
    hasRemoteControl: false,
    mcpServersConnected: 0,
    hasMcpServers: false,
    shipVerifyStageRecent: 0,
    shipsRecent: 0,
    goCommandUses: 0,
    batchCommandUses: 0,
    focusCommandUses: 0,
    scheduleCommandUses: 0,
    babysitLoopUses: 0,
    loopCommandUses: 0,
    planThenLaunchSessions: 0,
    rewindCommandUses: 0,
    worktreeAliasCount: 0,
    worktreeShortcutCount: 0,
    has: {
      superpowers: false,
      prReviewToolkit: false,
      codeReview: false,
      codeSimplifier: false,
      featureDev: false,
      skillCreator: false,
      claudeMdMgmt: false,
      ralphLoop: false,
      commitCommands: false,
      explanatoryStyle: false,
      playwright: false,
      semgrep: false,
      vercel: false,
      imessage: false,
      karpathy: false,
      claudeCodeSetup: false,
      frontendDesign: false,
    },
    insights: null,
  };
  return deepMerge(base, overrides);
}

export function makeInsights(overrides = {}) {
  const base = {
    capturedAt: "2026-04-25T07:15:00.000Z",
    lookbackDays: 30,
    sessionsAnalyzed: 100,
    subagentSessionCount: 0,
    mcpSessionCount: 0,
    multiTaskSessionCount: 0,
    taskInvocationsTotal: 0,
    toolInvocationsTotal: 0,
    scheduledInvocationsTotal: 0,
    remoteInvocationsTotal: 0,
    toolInvocationsByPlugin: {},
    gitCommitsTotal: 0,
    frictionCounts: {},
    outcomeCounts: {},
    hookFireCount: 0,
    hookFiresByEvent: {},
    transcriptsScanned: false,
    autoModeSessionCount: null,
    bypassPermissionsSessionCount: null,
    planModeSessionCount: null,
    worktreeUsageSessionCount: null,
    learningModeSessionCount: null,
    learningModeMatchesTotal: null,
  };
  return deepMerge(base, overrides);
}

export function makeRubric() {
  return {
    dimensions: [
      {
        id: "automation",
        title: "Automation",
        weight: 3,
        target: 90,
        rubricArea: "x",
        borisTips: "1",
        nextActions: ["a"],
      },
      {
        id: "permissions",
        title: "Permissions",
        weight: 3,
        target: 85,
        rubricArea: "x",
        borisTips: "1",
        nextActions: ["a"],
      },
      {
        id: "model-effort",
        title: "Model & Effort",
        weight: 3,
        target: 90,
        rubricArea: "x",
        borisTips: "1",
        nextActions: ["a"],
      },
      {
        id: "parallel",
        title: "Parallel",
        weight: 3,
        target: 90,
        rubricArea: "x",
        borisTips: "1",
        nextActions: ["a"],
      },
      {
        id: "verification",
        title: "Verification",
        weight: 3,
        target: 95,
        rubricArea: "x",
        borisTips: "1",
        nextActions: ["a"],
      },
      {
        id: "memory",
        title: "Memory",
        weight: 3,
        target: 92,
        rubricArea: "x",
        borisTips: "1",
        nextActions: ["a"],
      },
      {
        id: "planning",
        title: "Planning",
        weight: 2,
        target: 95,
        rubricArea: "x",
        borisTips: "1",
        nextActions: ["a"],
      },
      {
        id: "integrations",
        title: "Integrations",
        weight: 2,
        target: 95,
        rubricArea: "x",
        borisTips: "1",
        nextActions: ["a"],
      },
      {
        id: "customization",
        title: "Customization",
        weight: 1,
        target: 80,
        rubricArea: "x",
        borisTips: "1",
        nextActions: ["a"],
      },
      {
        id: "scheduled",
        title: "Scheduled",
        weight: 2,
        target: 80,
        rubricArea: "x",
        borisTips: "1",
        nextActions: ["a"],
      },
      {
        id: "remote",
        title: "Remote",
        weight: 1,
        target: 75,
        rubricArea: "x",
        borisTips: "1",
        nextActions: ["a"],
      },
      {
        id: "learning",
        title: "Learning",
        weight: 1,
        target: 90,
        rubricArea: "x",
        borisTips: "1",
        nextActions: ["a"],
      },
    ],
  };
}

export function makeAssessment(overrides = {}) {
  const rubric = makeRubric();
  return {
    capturedAt: "2026-04-25T07:15:00.000Z",
    overall: 60,
    executionOverall: 50,
    targetOverall: 100,
    user: "Test User",
    scores: rubric.dimensions.map((d) => ({
      id: d.id,
      score: 60,
      rawScore: 60,
      tier: "developing",
      evidence: ["sample evidence"],
      gaps: ["sample gap"],
      target: 100,
      rawTarget: d.target,
      weight: d.weight,
    })),
    trends: Object.fromEntries(rubric.dimensions.map((d) => [d.id, "flat"])),
    signalsSummary: {},
    ...overrides,
  };
}

function deepMerge(a, b) {
  if (Array.isArray(b)) return b.slice();
  if (b && typeof b === "object") {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) {
      out[k] =
        a && typeof a[k] === "object" && a[k] !== null && !Array.isArray(a[k])
          ? deepMerge(a[k], v)
          : v;
    }
    return out;
  }
  return b;
}
