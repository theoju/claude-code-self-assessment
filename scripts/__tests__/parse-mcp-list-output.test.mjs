import { describe, it, expect } from "vitest";
import { parseMcpListOutput } from "../signals.mjs";

const SAMPLE = `Checking MCP server health…

claude.ai Slack: https://mcp.slack.com/mcp - ✓ Connected
claude.ai Google Drive: https://drivemcp.googleapis.com/mcp/v1 - ! Needs authentication
plugin:context7:context7: npx -y @upstash/context7-mcp - ✓ Connected
plugin:github:github: https://api.githubcopilot.com/mcp/ (HTTP) - ✗ Failed to connect
plugin:figma:figma: https://mcp.figma.com/mcp (HTTP) - ! Needs authentication
plugin:terraform:terraform: docker run -i --rm hashicorp/terraform-mcp-server:0.4.0 - ✓ Connected
`;

describe("parseMcpListOutput", () => {
  it("returns empty array for empty input", () => {
    expect(parseMcpListOutput("")).toEqual([]);
    expect(parseMcpListOutput(undefined)).toEqual([]);
  });

  it("ignores the 'Checking MCP server health…' header line", () => {
    const out = parseMcpListOutput("Checking MCP server health…\n\n");
    expect(out).toEqual([]);
  });

  it("parses claude.ai-prefixed entries with connected status", () => {
    const out = parseMcpListOutput(
      "claude.ai Slack: https://mcp.slack.com/mcp - ✓ Connected\n",
    );
    expect(out).toEqual([
      {
        name: "claude.ai Slack",
        scope: "claude.ai",
        status: "connected",
      },
    ]);
  });

  it("parses plugin-prefixed entries", () => {
    const out = parseMcpListOutput(
      "plugin:context7:context7: npx -y @upstash/context7-mcp - ✓ Connected\n",
    );
    expect(out).toEqual([
      {
        name: "plugin:context7:context7",
        scope: "plugin",
        status: "connected",
      },
    ]);
  });

  it("classifies all three statuses", () => {
    const out = parseMcpListOutput(SAMPLE);
    const statuses = out.map((e) => e.status).sort();
    expect(statuses).toEqual([
      "connected",
      "connected",
      "connected",
      "failed",
      "needs-auth",
      "needs-auth",
    ]);
  });

  it("parses the full sample into 6 entries with correct scope split", () => {
    const out = parseMcpListOutput(SAMPLE);
    expect(out).toHaveLength(6);
    const scopes = out.map((e) => e.scope).sort();
    expect(scopes).toEqual([
      "claude.ai",
      "claude.ai",
      "plugin",
      "plugin",
      "plugin",
      "plugin",
    ]);
  });

  it("ignores malformed lines without crashing", () => {
    expect(parseMcpListOutput("garbage line\n")).toEqual([]);
    expect(parseMcpListOutput(":\n")).toEqual([]);
  });
});
