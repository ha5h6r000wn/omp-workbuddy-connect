import { chmod, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WORKBUDDY_INTL } from "../src/site.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const temp = await mkdtemp(join(tmpdir(), "workbuddy-settings-"));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = temp;

try {
  // OMP snapshots directory env at module load; refresh before importing settings.
  const { getAgentDir, refreshDirsFromEnv } = await import("@oh-my-pi/pi-utils");
  refreshDirsFromEnv();
  assert(getAgentDir() === temp, "OMP agent directory was not isolated");
  const settings = await import("../src/settings.ts");
  const path = join(temp, ".workbuddy-settings.json");
  assert(settings.workBuddySettingsPath(WORKBUDDY_INTL) === path, "settings did not honor OMP's public agent directory");
  assert(settings.loadSettings(WORKBUDDY_INTL).scope === "free", "missing settings did not use safe free scope");

  await settings.saveSettings(WORKBUDDY_INTL, "all");
  const raw = await readFile(path, "utf8");
  const parsed: unknown = JSON.parse(raw);
  assert(typeof parsed === "object" && parsed !== null && "scope" in parsed && parsed.scope === "all", "saved scope was not readable");
  assert(Object.keys(parsed).join(",") === "scope", `settings persisted fields other than scope: ${raw}`);
  assert(!raw.includes("token") && !raw.includes("credential") && !raw.includes("secret"), "settings persisted credential material");
  // NTFS has no POSIX mode bits: stat() reports 0o666 for every writable file and
  // chmod only toggles the read-only attribute, so owner-only bytes are a POSIX
  // guarantee. Windows relies on the inherited per-user profile ACLs instead.
  if (process.platform !== "win32") {
    assert(((await stat(path)).mode & 0o777) === 0o600, "settings permissions are not 0600");
  }

  // A read-only directory cannot be built on Windows (chmod leaves writes working),
  // so reachability of the atomic-failure branch is a POSIX-only check.
  if (process.platform !== "win32") {
    let failedAtomically = false;
    await chmod(temp, 0o500);
    try {
      await settings.saveSettings(WORKBUDDY_INTL, "free");
    } catch {
      failedAtomically = true;
    } finally {
      await chmod(temp, 0o700);
    }
    assert(failedAtomically, "read-only settings directory did not exercise the failure path");
    assert(await readFile(path, "utf8") === raw, "failed atomic update changed committed settings bytes");
    assert(
      (await readdir(temp)).join(",") === ".workbuddy-settings.json",
      "failed atomic update left a temporary settings file",
    );
  }

  await settings.saveSettings(WORKBUDDY_INTL, "free");
  assert(settings.loadSettings(WORKBUDDY_INTL).scope === "free", "free scope did not survive restart load");
  console.log(
    `OK: settings use isolated OMP agent dir, replace atomically, and persist scope only${
      process.platform === "win32" ? "" : " (0600 plus read-only-directory failure path)"
    }`,
  );
} finally {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  const { refreshDirsFromEnv } = await import("@oh-my-pi/pi-utils");
  refreshDirsFromEnv();
  await rm(temp, { recursive: true, force: true });
}
