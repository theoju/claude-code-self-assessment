// Deterministic scoring. Pure function of signals → {score, tier, evidence, gaps}.
// Rules are intentionally transparent so trends (↗/↘) reflect actual config changes.

export const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));

export function tierFor(score) {
  if (score >= 85) return "advanced";
  if (score >= 70) return "solid";
  if (score >= 55) return "developing";
  if (score >= 30) return "starter";
  return "not-touched";
}

export const SCORERS = {
  automation(s) {
    let score = 25;
    const ev = [];
    const gaps = [];
    if (s.settings.hookTotalCount > 0) {
      score += Math.min(25, s.settings.hookTotalCount * 8);
      ev.push(`${s.settings.hookTotalCount} hook(s) configured across: ${s.settings.hookEvents.join(", ")}`);
    } else {
      gaps.push("settings.json has no hooks block — no PostToolUse, Stop, SessionStart, or PostCompact hooks");
    }
    if (s.personalAgents.length > 0) {
      score += Math.min(15, 5 * s.personalAgents.length);
      ev.push(`${s.personalAgents.length} personal agent(s) under ~/.claude/agents`);
    } else {
      gaps.push("~/.claude/agents is empty — zero personal custom agents");
    }
    if (s.personalCommands.length > 0) {
      score += Math.min(15, 5 * s.personalCommands.length);
      ev.push(`${s.personalCommands.length} personal slash command(s) under ~/.claude/commands`);
    } else {
      gaps.push("~/.claude/commands is empty — zero personal slash commands");
    }
    if (s.projectCommands.length > 0) {
      score += 8;
      ev.push(`${s.projectCommands.length} project-scoped command(s) under .claude/commands`);
    }
    if (s.personalSkills.filter((x) => x !== "boris").length > 0) {
      score += 7;
      ev.push(`${s.personalSkills.length} personal skill(s)`);
    } else {
      gaps.push("No personal skills beyond plugin-installed ones");
    }
    if (s.has.prReviewToolkit || s.has.codeReview) ev.push("Review/simplify plugins cover PR lifecycle");
    return { score: clamp(score), evidence: ev, gaps };
  },

  permissions(s) {
    let score = 50;
    const ev = [];
    const gaps = [];
    if (s.settings.skipDangerousModePermissionPrompt) {
      score -= 25;
      gaps.push("skipDangerousModePermissionPrompt: true bypasses the auto-mode classifier — strict downgrade");
    } else {
      score += 15;
      ev.push("Not using the dangerous-skip bypass");
    }
    const allowCount = s.settings.allowList.length;
    if (allowCount === 0) {
      gaps.push("No permission allowlist entries — every new tool triggers a prompt");
    } else {
      score += Math.min(20, allowCount * 3);
      ev.push(`${allowCount} permission allowlist entr${allowCount === 1 ? "y" : "ies"}`);
    }
    if (s.settings.denyList.length > 0) {
      score += 5;
      ev.push(`${s.settings.denyList.length} denylist entries`);
    }
    return { score: clamp(score), evidence: ev, gaps };
  },

  "model-effort"(s) {
    let score = 40;
    const ev = [];
    const gaps = [];
    const effort = s.settings.effortLevel;
    if (effort === "max" || effort === "xhigh") {
      score += 35;
      ev.push(`effortLevel: "${effort}" — aligned with Opus 4.7 expectations`);
    } else if (effort === "high") {
      score += 15;
      gaps.push(`effortLevel: "high" — Opus 4.7's tuned default is "xhigh"`);
    } else if (effort === "medium" || effort === "low") {
      gaps.push(`effortLevel: "${effort}" — significantly under-tuned for 4.7`);
    }
    if (s.settings.autoCompactWindow) {
      score += 15;
      ev.push(`CLAUDE_CODE_AUTO_COMPACT_WINDOW=${s.settings.autoCompactWindow} set`);
    } else {
      gaps.push("No CLAUDE_CODE_AUTO_COMPACT_WINDOW env var — exposed to context rot past 300-400k tokens");
    }
    return { score: clamp(score), evidence: ev, gaps };
  },

  parallel(s) {
    let score = 40;
    const ev = [];
    const gaps = [];
    if (s.has.superpowers) {
      score += 15;
      ev.push("superpowers plugin: worktrees, parallel agents, subagent-driven-development");
    }
    if (s.has.prReviewToolkit) {
      score += 8;
      ev.push("pr-review-toolkit: parallel specialist reviewers");
    }
    if (s.has.featureDev) {
      score += 7;
      ev.push("feature-dev: code-architect / code-explorer / code-reviewer agents");
    }
    if (s.personalAgents.length >= 1) {
      score += 15;
      ev.push(`${s.personalAgents.length} personal agent(s) tuned to your domain`);
    } else {
      gaps.push("No personal custom agents tuned to your domain");
    }
    if (s.personalAgents.length === 0) gaps.push("Worktree muscle memory unverified — no personal agents using isolation:worktree");
    return { score: clamp(score), evidence: ev, gaps };
  },

  verification(s) {
    let score = 40;
    const ev = [];
    const gaps = [];
    if (s.has.playwright) { score += 15; ev.push("playwright plugin — browser verification"); }
    if (s.has.semgrep) { score += 10; ev.push("semgrep plugin — static analysis"); }
    if (s.has.prReviewToolkit || s.has.codeReview) { score += 10; ev.push("post-change review plugins"); }
    if (s.has.superpowers) { score += 5; ev.push("superpowers:verification-before-completion active"); }
    const hasGo = s.personalCommands.includes("go.md") || s.projectCommands.includes("go.md");
    if (hasGo) { score += 12; ev.push("/go composite command present"); }
    else gaps.push("No /go composite command in personal or project library");
    if (!s.has.playwright) gaps.push("No browser-automation plugin — frontend verification is incomplete");
    return { score: clamp(score), evidence: ev, gaps };
  },

  memory(s) {
    let score = 45;
    const ev = [];
    const gaps = [];
    if (s.memory.length > 0) {
      score += 20;
      ev.push(`Auto-memory active on ${s.memory.length} project(s) — ${s.memory.reduce((n, m) => n + m.fileCount, 0)} memory files total`);
    } else {
      gaps.push("No MEMORY.md files found under ~/.claude/projects");
    }
    if (s.has.claudeMdMgmt) { score += 10; ev.push("claude-md-management plugin installed"); }
    if (s.claudeMdExists) { score += 10; ev.push("CLAUDE.md present (project or global)"); }
    else gaps.push("No CLAUDE.md at project root yet");
    if (s.plansCount > 10) { score += 8; ev.push(`${s.plansCount} saved plans — active planner`); }
    if (!s.settings.autoCompactWindow) gaps.push("No CLAUDE_CODE_AUTO_COMPACT_WINDOW set — context rot risk above 300-400k");
    return { score: clamp(score), evidence: ev, gaps };
  },

  planning(s) {
    let score = 55;
    const ev = [];
    const gaps = [];
    if (s.has.superpowers) { score += 15; ev.push("brainstorming / writing-plans / executing-plans skills"); }
    if (s.has.karpathy) { score += 8; ev.push("karpathy-guidelines — surgical, verifiable prompts"); }
    if (s.plansCount >= 10) { score += 10; ev.push(`${s.plansCount} saved plans`); }
    if (s.has.featureDev) { score += 5; ev.push("feature-dev: structured feature workflow"); }
    gaps.push("Behavioral check: does every non-trivial prompt include Goal / Constraints / Acceptance Criteria upfront?");
    return { score: clamp(score), evidence: ev, gaps };
  },

  integrations(s) {
    let score = 20;
    const ev = [];
    const gaps = [];
    score += Math.min(70, s.plugins.length * 3);
    ev.push(`${s.plugins.length} plugins enabled`);
    if (s.has.vercel) ev.push("vercel plugin installed");
    if (s.has.imessage) ev.push("imessage plugin — Boris tip 44 adopted");
    if (!s.plugins.some((p) => p.toLowerCase().includes("slack"))) {
      gaps.push("No Slack MCP — Boris tip 9 relies on it for bug triage and daily summaries");
    }
    return { score: clamp(score), evidence: ev, gaps };
  },

  customization(s) {
    let score = 45;
    const ev = [];
    const gaps = [];
    if (s.statuslineConfigured) { score += 15; ev.push("Custom statusline.sh configured"); }
    if (s.has.explanatoryStyle) { score += 10; ev.push("explanatory-output-style plugin enabled"); }
    if (s.keybindingsConfigured) { score += 10; ev.push("Custom keybindings.json"); }
    else gaps.push("No custom ~/.claude/keybindings.json");
    return { score: clamp(score), evidence: ev, gaps };
  },

  scheduled(s) {
    let score = 25;
    const ev = [];
    const gaps = [];
    if (s.has.ralphLoop) { score += 15; ev.push("ralph-loop plugin — /loop capability"); }
    const hasScheduled =
      s.personalCommands.some((c) => c.includes("babysit") || c.includes("loop")) ||
      s.projectCommands.some((c) => c.includes("babysit") || c.includes("loop"));
    if (hasScheduled) { score += 20; ev.push("Custom scheduled/loop commands present"); }
    else gaps.push("No active /loop babysitter or /schedule job in personal commands");
    const stopHook = (s.settings.hookEvents || []).includes("Stop");
    if (stopHook) { score += 10; ev.push("Stop hook configured"); }
    else gaps.push("No Stop hook for task-completion notifications — Boris tip 75");
    return { score: clamp(score), evidence: ev, gaps };
  },

  remote(s) {
    let score = 35;
    const ev = [];
    const gaps = [];
    if (s.has.imessage) { score += 20; ev.push("imessage plugin installed"); }
    else gaps.push("No imessage plugin — Boris tip 44");
    return { score: clamp(score), evidence: ev, gaps };
  },

  learning(s) {
    let score = 55;
    const ev = [];
    const gaps = [];
    if (s.has.explanatoryStyle) { score += 20; ev.push("explanatory-output-style enabled"); }
    if (s.has.karpathy) { score += 10; ev.push("karpathy-guidelines — anti-overcomplication behavior"); }
    if (s.has.skillCreator) { score += 5; ev.push("skill-creator plugin — self-improving toolkit"); }
    return { score: clamp(score), evidence: ev, gaps };
  },
};

export function scoreAll(rubric, signals) {
  const now = new Date().toISOString();
  const scores = rubric.dimensions.map((d) => {
    const fn = SCORERS[d.id];
    if (!fn) return { id: d.id, score: 0, tier: "not-touched", evidence: [], gaps: [] };
    const { score, evidence, gaps } = fn(signals);
    return {
      id: d.id,
      score,
      tier: tierFor(score),
      evidence,
      gaps,
      target: d.target,
      weight: d.weight,
    };
  });

  const totalW = rubric.dimensions.reduce((s, d) => s + d.weight, 0);
  const overall = Math.round(
    scores.reduce((s, r) => {
      const d = rubric.dimensions.find((x) => x.id === r.id);
      return s + r.score * d.weight;
    }, 0) / totalW
  );
  const targetOverall = Math.round(
    rubric.dimensions.reduce((s, d) => s + d.target * d.weight, 0) / totalW
  );

  return { capturedAt: now, overall, targetOverall, scores };
}

export function computeTrends(current, history) {
  const prev = history && history.length ? history[history.length - 1] : null;
  const trends = {};
  for (const s of current.scores) {
    if (!prev) trends[s.id] = "new";
    else {
      const prevEntry = prev.scores.find((x) => x.id === s.id);
      if (!prevEntry) trends[s.id] = "new";
      else if (s.score > prevEntry.score + 1) trends[s.id] = "improving";
      else if (s.score < prevEntry.score - 1) trends[s.id] = "slipping";
      else trends[s.id] = "flat";
    }
  }
  return trends;
}
