import { readFileSync } from "node:fs";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getAgentDir } from "@oh-my-pi/pi-coding-agent";
import type { ModelScope } from "./models.ts";
import type { SiteDescriptor } from "./site.ts";

export interface WorkBuddySettings {
  scope: ModelScope;
}

export function workBuddySettingsPath(site: SiteDescriptor, agentDir = getAgentDir()): string {
  return join(agentDir, site.settingsFile);
}

export function loadSettings(site: SiteDescriptor, agentDir = getAgentDir()): WorkBuddySettings {
  try {
    const value: unknown = JSON.parse(readFileSync(workBuddySettingsPath(site, agentDir), "utf8"));
    if (typeof value === "object" && value !== null && "scope" in value && value.scope === "all") {
      return { scope: "all" };
    }
  } catch { /* Missing or invalid settings use the safe free scope. */ }
  return { scope: "free" };
}

export async function saveSettings(
  site: SiteDescriptor,
  scope: ModelScope,
  agentDir = getAgentDir(),
): Promise<void> {
  await mkdir(agentDir, { recursive: true, mode: 0o700 });
  const path = workBuddySettingsPath(site, agentDir);
  const stem = site.settingsFile.endsWith(".json") ? site.settingsFile.slice(0, -5) : site.settingsFile;
  const temporaryPath = join(agentDir, `${stem}.${process.pid}.${randomUUID()}.tmp`);
  try {
    const temporary = await open(temporaryPath, "wx", 0o600);
    try {
      await temporary.writeFile(`${JSON.stringify({ scope }, null, 2)}\n`);
      await temporary.chmod(0o600);
      await temporary.sync();
    } finally {
      await temporary.close();
    }
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
