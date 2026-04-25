// Slack webhook poster. Pure function: takes assessment + config, returns blocks + posts.

import { CRITERIA } from "./claude-md-audit.mjs";

export function buildSlackMessage(assessment, rubric, config) {
  const { overall, targetOverall, scores, capturedAt } = assessment;
  const byId = Object.fromEntries(rubric.dimensions.map((d) => [d.id, d]));

  const topGaps = [...scores]
    .map((s) => ({ ...s, title: byId[s.id].title, gap: byId[s.id].target - s.score, weight: byId[s.id].weight }))
    .filter((s) => s.gap >= 20)
    .sort((a, b) => b.weight * b.gap - a.weight * a.gap)
    .slice(0, 3);

  const strengths = [...scores]
    .filter((s) => s.score >= 80)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => ({ title: byId[s.id].title, score: s.score }));

  const url = config?.publish?.publicUrl || "http://localhost:3737";
  const date = new Date(capturedAt).toISOString().slice(0, 10);
  const name = config?.user?.displayName || "Engineer";

  return {
    channel: config?.slack?.channel,
    username: config?.slack?.username || "Claude Code Mastery",
    icon_emoji: config?.slack?.iconEmoji || ":chart_with_upwards_trend:",
    text: `${name}'s Claude Code Mastery — ${overall}/${targetOverall} (${date})`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `Claude Code Mastery — ${name}` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Overall*\n${overall} / ${targetOverall}` },
          { type: "mrkdwn", text: `*Date*\n${date}` },
        ],
      },
      strengths.length
        ? {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                "*Strengths*\n" +
                strengths.map((s) => `• ${s.title} — ${s.score}`).join("\n"),
            },
          }
        : null,
      topGaps.length
        ? {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                "*Biggest gaps (weight × deficit)*\n" +
                topGaps
                  .map((s) => `• ${s.title} — ${s.score}/${byId[s.id].target} (w×${s.weight})`)
                  .join("\n"),
            },
          }
        : null,
      assessment.claudeMd?.summary
        ? (() => {
            const s = assessment.claudeMd.summary;
            const avgPart = s.avgScore == null ? "no scoreable files" : `Avg ${s.avgScore} (${s.avgGrade})`;
            const lines = [
              `*CLAUDE.md health* _(report-only)_`,
              `Targets: ${s.targets} · Files: ${s.files} · ${avgPart}`,
            ];
            if (s.files > 0) {
              const d = s.distribution;
              lines.push(`Distribution: A:${d.A} B:${d.B} C:${d.C} D:${d.D} F:${d.F}`);
            }
            if (s.targetsMissing) lines.push(`Targets without CLAUDE.md: ${s.targetsMissing}`);
            if (s.targetsError) lines.push(`Targets with errors: ${s.targetsError}`);
            if (s.avgBreakdown) {
              lines.push(
                "*Breakdown (avg)*",
                CRITERIA.map(
                  (c) => `• ${c.label}: \`${s.avgBreakdown[c.key]}/${c.max}\``
                ).join("\n")
              );
            }
            return { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } };
          })()
        : null,
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Open full dashboard" },
            url,
          },
        ],
      },
    ].filter(Boolean),
  };
}

export async function postToSlack(message) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    return { posted: false, reason: "SLACK_WEBHOOK_URL not set" };
  }
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { posted: false, reason: `${res.status} ${res.statusText} ${body}`.trim() };
  }
  return { posted: true };
}
