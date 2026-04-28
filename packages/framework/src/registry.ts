/**
 * registry.ts — fetch skill index and download skill folders from a remote registry.
 *
 * Registry layout (GitHub repo):
 *   index.json           — array of { name, description, path }
 *   <skill-name>/        — skill folder (mirrors local skill folder structure)
 *     SKILL.md
 *     scripts/...
 *     references/...
 */

import * as fs from "fs";
import * as path from "path";

export interface RegistryEntry {
  name: string;
  description: string;
  path: string;
}

export interface RegistryIndex {
  entries: RegistryEntry[];
  registryUrl: string;
}

// GitHub Contents API item
interface GithubContentItem {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url: string | null;
}

export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryError";
  }
}

export async function fetchIndex(registryUrl: string): Promise<RegistryIndex> {
  const indexUrl = `${registryUrl.replace(/\/$/, "")}/index.json`;
  const res = await fetch(indexUrl);
  if (!res.ok) {
    throw new RegistryError(`Failed to fetch registry index (${res.status}): ${indexUrl}`);
  }
  const entries = (await res.json()) as RegistryEntry[];
  return { entries, registryUrl };
}

export function searchIndex(index: RegistryIndex, query: string): RegistryEntry[] {
  if (!query.trim()) return index.entries;
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return index.entries.filter((e) => {
    const haystack = `${e.name} ${e.description}`.toLowerCase();
    return tokens.some((t) => haystack.includes(t));
  });
}

/**
 * Download a skill folder from the registry into a local temp directory.
 * Returns the path to the downloaded skill folder.
 */
export async function downloadSkill(
  skillName: string,
  index: RegistryIndex,
): Promise<string> {
  const entry = index.entries.find((e) => e.name === skillName);
  if (!entry) {
    throw new RegistryError(`Skill "${skillName}" not found in registry`);
  }

  // raw: https://raw.githubusercontent.com/<owner>/<repo>/main
  // api: https://api.github.com/repos/<owner>/<repo>/contents
  const apiBase = rawUrlToApiBase(index.registryUrl);
  const tmpDir = fs.mkdtempSync(path.join(getTmpDir(), "skill-download-"));
  try {
    const skillDestDir = path.join(tmpDir, skillName);
    fs.mkdirSync(skillDestDir, { recursive: true });
    await downloadDirectory(`${apiBase}/${entry.path}`, skillDestDir, apiBase);
    return skillDestDir;
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

async function downloadDirectory(
  apiUrl: string,
  destDir: string,
  apiBase: string,
): Promise<void> {
  const res = await fetch(apiUrl, {
    headers: { Accept: "application/vnd.github.v3+json" },
  });
  if (!res.ok) {
    throw new RegistryError(`GitHub API error (${res.status}): ${apiUrl}`);
  }

  const items = (await res.json()) as GithubContentItem[];

  await Promise.all(
    items.map(async (item) => {
      const itemDest = path.join(destDir, item.name);
      if (item.type === "dir") {
        fs.mkdirSync(itemDest, { recursive: true });
        await downloadDirectory(`${apiBase}/${item.path}`, itemDest, apiBase);
      } else if (item.download_url) {
        const fileRes = await fetch(item.download_url);
        if (!fileRes.ok) {
          throw new RegistryError(`Failed to download ${item.path} (${fileRes.status})`);
        }
        fs.writeFileSync(itemDest, Buffer.from(await fileRes.arrayBuffer()));
        if (item.name.endsWith(".sh")) {
          fs.chmodSync(itemDest, 0o755);
        }
      }
    }),
  );
}

function rawUrlToApiBase(rawUrl: string): string {
  // https://raw.githubusercontent.com/<owner>/<repo>/main
  // → https://api.github.com/repos/<owner>/<repo>/contents
  const match = rawUrl.match(
    /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)/,
  );
  if (!match) {
    throw new RegistryError(
      `Cannot derive GitHub API URL from registry URL: ${rawUrl}. ` +
        "Expected format: https://raw.githubusercontent.com/<owner>/<repo>/<branch>",
    );
  }
  const [, owner, repo] = match;
  return `https://api.github.com/repos/${owner}/${repo}/contents`;
}

function getTmpDir(): string {
  return process.env.TMPDIR ?? process.env.TMP ?? process.env.TEMP ?? "/tmp";
}
