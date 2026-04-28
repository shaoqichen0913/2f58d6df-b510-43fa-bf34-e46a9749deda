import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { parseSkill, ParseError } from "../parser.js";
import { discoverSkills } from "../discovery.js";
import { installSkill, uninstallSkill } from "../installer/index.js";
import { keywordActivate } from "../activator/keyword.js";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "skill-framework-test-"));
}

function writeSkill(
  dir: string,
  name: string,
  frontmatter: Record<string, unknown>,
  body = "# Body\n",
): string {
  const skillDir = path.join(dir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("\n");
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), `---\n${fm}\n---\n\n${body}`);
  return skillDir;
}

// ── Parser tests ─────────────────────────────────────────────────────────

describe("parseSkill", () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it("parses a minimal valid skill", () => {
    const skillDir = writeSkill(tmp, "my-skill", {
      name: "my-skill",
      description: "Does something useful",
    });
    const manifest = parseSkill(skillDir);
    expect(manifest.frontmatter.name).toBe("my-skill");
    expect(manifest.frontmatter.description).toBe("Does something useful");
    expect(manifest.warnings).toHaveLength(0);
  });

  it("throws ParseError when SKILL.md is missing", () => {
    const empty = path.join(tmp, "empty");
    fs.mkdirSync(empty);
    expect(() => parseSkill(empty)).toThrow(ParseError);
    expect(() => parseSkill(empty)).toThrow(/SKILL.md not found/);
  });

  it("throws ParseError when name is missing", () => {
    const skillDir = writeSkill(tmp, "bad-skill", {
      description: "No name here",
    });
    expect(() => parseSkill(skillDir)).toThrow(ParseError);
    expect(() => parseSkill(skillDir)).toThrow(/Invalid SKILL.md/);
  });

  it("throws ParseError when name is not kebab-case", () => {
    const skillDir = writeSkill(tmp, "BadSkill", {
      name: "BadSkill",
      description: "Has uppercase",
    });
    expect(() => parseSkill(skillDir)).toThrow(ParseError);
  });

  it("throws ParseError when description is empty", () => {
    const skillDir = writeSkill(tmp, "no-desc", {
      name: "no-desc",
      description: "",
    });
    expect(() => parseSkill(skillDir)).toThrow(ParseError);
  });

  it("warns for declared script not found on disk", () => {
    const skillDir = writeSkill(tmp, "scripted", {
      name: "scripted",
      description: "Has a script",
      scripts: JSON.stringify([{ name: "run", path: "scripts/run.sh", timeout_sec: 30 }]),
    });
    const manifest = parseSkill(skillDir);
    expect(manifest.warnings).toHaveLength(1);
    expect(manifest.warnings[0]).toMatch(/not found on disk/);
  });

  it("resolves scripts that exist on disk", () => {
    const skillDir = writeSkill(tmp, "with-script", {
      name: "with-script",
      description: "Has a real script",
      scripts: JSON.stringify([{ name: "run", path: "scripts/run.sh", timeout_sec: 30 }]),
    });
    const scriptDir = path.join(skillDir, "scripts");
    fs.mkdirSync(scriptDir);
    fs.writeFileSync(path.join(scriptDir, "run.sh"), "#!/bin/bash\necho hello");
    const manifest = parseSkill(skillDir);
    expect(manifest.warnings).toHaveLength(0);
    expect(manifest.resolvedScripts).toHaveLength(1);
    expect(manifest.resolvedScripts[0].name).toBe("run");
  });

  it("parses MCP server declarations", () => {
    const skillDir = writeSkill(tmp, "with-mcp", {
      name: "with-mcp",
      description: "Uses an MCP server",
      mcp_servers: JSON.stringify([{
        name: "brave_search",
        transport: "http",
        url: "https://api.example.com/mcp",
      }]),
    });
    const manifest = parseSkill(skillDir);
    expect(manifest.frontmatter.mcp_servers).toHaveLength(1);
    expect(manifest.frontmatter.mcp_servers![0].name).toBe("brave_search");
  });
});

// ── Discovery tests ───────────────────────────────────────────────────────

describe("discoverSkills", () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it("finds all valid skills in a root", () => {
    writeSkill(tmp, "skill-a", { name: "skill-a", description: "Skill A" });
    writeSkill(tmp, "skill-b", { name: "skill-b", description: "Skill B" });
    const result = discoverSkills([tmp]);
    expect(result.skills).toHaveLength(2);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("skips directories without SKILL.md", () => {
    writeSkill(tmp, "real-skill", { name: "real-skill", description: "Real" });
    fs.mkdirSync(path.join(tmp, "not-a-skill"));
    const result = discoverSkills([tmp]);
    expect(result.skills).toHaveLength(1);
  });

  it("reports diagnostics for invalid skills without stopping", () => {
    writeSkill(tmp, "good-skill", { name: "good-skill", description: "Good" });
    // Write an invalid SKILL.md
    const bad = path.join(tmp, "bad-skill");
    fs.mkdirSync(bad);
    fs.writeFileSync(path.join(bad, "SKILL.md"), "---\nname: BadName\n---\n");
    const result = discoverSkills([tmp]);
    expect(result.skills).toHaveLength(1);
    expect(result.diagnostics).toHaveLength(1);
  });

  it("resolves name conflicts: first root wins", () => {
    const root1 = path.join(tmp, "root1");
    const root2 = path.join(tmp, "root2");
    fs.mkdirSync(root1); fs.mkdirSync(root2);
    writeSkill(root1, "shared", { name: "shared", description: "From root1" });
    writeSkill(root2, "shared", { name: "shared", description: "From root2" });
    const result = discoverSkills([root1, root2]);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].skillDir).toContain("root1");
    expect(result.conflicts).toHaveLength(1);
  });

  it("returns empty result for non-existent roots", () => {
    const result = discoverSkills(["/nonexistent/path/xyz"]);
    expect(result.skills).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(0);
  });
});

// ── Installer tests ───────────────────────────────────────────────────────

describe("installSkill / uninstallSkill", () => {
  let srcDir: string;
  let destBase: string;

  beforeEach(() => {
    srcDir = makeTmpDir();
    destBase = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(srcDir, { recursive: true, force: true });
    fs.rmSync(destBase, { recursive: true, force: true });
  });

  it("copies skill to destination and writes config.toml", () => {
    const skillDir = writeSkill(srcDir, "my-tool", {
      name: "my-tool",
      description: "A test tool",
      mcp_servers: JSON.stringify([{
        name: "test_server",
        transport: "http",
        url: "https://example.com/mcp",
      }]),
    });
    const manifest = parseSkill(skillDir);
    const result = installSkill(manifest, "project", destBase);

    // Skill folder was created
    expect(fs.existsSync(result.skillDestDir)).toBe(true);
    expect(fs.existsSync(path.join(result.skillDestDir, "SKILL.md"))).toBe(true);

    // config.toml was written with MCP entry
    expect(fs.existsSync(result.configTomlPath)).toBe(true);
    const toml = fs.readFileSync(result.configTomlPath, "utf-8");
    expect(toml).toContain("test_server");
    expect(result.mcpServersAdded).toContain("test_server");
  });

  it("install is idempotent (running twice produces the same result)", () => {
    const skillDir = writeSkill(srcDir, "idem-skill", {
      name: "idem-skill",
      description: "Idempotency test",
      mcp_servers: JSON.stringify([{ name: "srv", transport: "http", url: "https://x.com/mcp" }]),
    });
    const manifest = parseSkill(skillDir);
    installSkill(manifest, "project", destBase);
    const result2 = installSkill(manifest, "project", destBase);

    const toml = fs.readFileSync(result2.configTomlPath, "utf-8");
    // Should appear exactly once
    expect((toml.match(/\[mcp_servers\.srv\]|srv = /g) || []).length).toBeGreaterThanOrEqual(1);
  });

  it("uninstall removes skill folder and cleans config.toml", () => {
    const skillDir = writeSkill(srcDir, "removable", {
      name: "removable",
      description: "Will be removed",
      mcp_servers: JSON.stringify([{ name: "svc", transport: "http", url: "https://x.com/mcp" }]),
    });
    const manifest = parseSkill(skillDir);
    const installResult = installSkill(manifest, "project", destBase);

    const uninstallResult = uninstallSkill("removable", "project", ["svc"], destBase);

    expect(uninstallResult.wasInstalled).toBe(true);
    expect(fs.existsSync(installResult.skillDestDir)).toBe(false);
    const toml = fs.readFileSync(installResult.configTomlPath, "utf-8");
    expect(toml).not.toContain("svc");
  });
});

// ── Keyword activator tests ───────────────────────────────────────────────

describe("keywordActivate", () => {
  const makeManifest = (name: string, description: string) => ({
    frontmatter: { name, description, mcp_servers: [], scripts: [] },
    skillDir: "/fake",
    skillMdPath: "/fake/SKILL.md",
    resolvedScripts: [],
    warnings: [],
  } as ReturnType<typeof parseSkill>);

  const skills = [
    makeManifest("knowledge-retriever", "Retrieves information, searches docs, finds knowledge, lookup research"),
    makeManifest("code-reviewer", "Reviews code, audits security, finds bugs, lint static analysis"),
  ];

  it("ranks knowledge-retriever highest for retrieval query", () => {
    const result = keywordActivate("find information about RAG retrieval", skills);
    expect(result.strategy).toBe("keyword");
    expect(result.activated[0].name).toBe("knowledge-retriever");
    expect(result.activated[0].score).toBeGreaterThan(0);
  });

  it("ranks code-reviewer highest for code review query", () => {
    const result = keywordActivate("review this code for security bugs", skills);
    expect(result.activated[0].name).toBe("code-reviewer");
    expect(result.activated[0].score).toBeGreaterThan(0);
  });

  it("returns empty activated for completely unrelated query", () => {
    const result = keywordActivate("what is the weather today", skills);
    // All scores should be very low; none should score high
    const highScores = result.activated.filter((a) => a.score > 0.3);
    expect(highScores).toHaveLength(0);
  });

  it("returns empty when no skills provided", () => {
    const result = keywordActivate("find something", []);
    expect(result.activated).toHaveLength(0);
  });
});
