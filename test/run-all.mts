import { readdir } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";

const roots = ["test", join("test", "contract")];
const files = (
  await Promise.all(roots.map(async (root) =>
    (await readdir(root))
      .filter((name) => name.endsWith(".test.mts"))
      .map((name) => join(root, name))))
).flat().sort();

// Every script keeps its own Bun process: they mutate process-wide state
// (PI_CODING_AGENT_DIR, global fetch, the OAuth registry), so sharing one
// process would leak state across files. Independent processes are free to run
// at the same time, and that overlap is what makes this runner fast.
//
// Cap the fan-out anyway: each process re-imports the whole OMP host, several
// scripts race wall-clock deadlines, and `task-runtime-contract` spawns its own
// Task subprocesses. Raise the cap with WORKBUDDY_TEST_CONCURRENCY on a host
// with headroom.
const DEFAULT_CONCURRENCY = 8;
const requested = Number(process.env.WORKBUDDY_TEST_CONCURRENCY);
// An explicit request wins over the heuristic; the default stays inside the
// hardware's own parallelism.
const limit = Number.isInteger(requested) && requested > 0
  ? requested
  : Math.min(DEFAULT_CONCURRENCY, availableParallelism());
const concurrency = Math.min(limit, files.length);

// A script that blocks forever must not freeze the suite: kill it at the
// deadline and report it like any other failure. Generous by default because the
// slowest script (`task-runtime-contract`) spawns real Task subprocesses.
const DEFAULT_SCRIPT_TIMEOUT_MS = 300_000;
const requestedTimeout = Number(process.env.WORKBUDDY_TEST_TIMEOUT_MS);
const scriptTimeoutMs = Number.isInteger(requestedTimeout) && requestedTimeout > 0
  ? requestedTimeout
  : DEFAULT_SCRIPT_TIMEOUT_MS;

console.log(`Running ${files.length} permanent regression scripts (concurrency ${concurrency})`);

const startedAt = Date.now();
const timings: { file: string; ms: number }[] = [];
const failures: { file: string; exitCode: number; killed: boolean }[] = [];
let next = 0;

async function run(file: string): Promise<void> {
  const started = Date.now();
  const child = Bun.spawn([process.execPath, file], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let killed = false;
  const deadline = setTimeout(() => {
    killed = true;
    child.kill();
  }, scriptTimeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(deadline);
  const ms = Date.now() - started;
  timings.push({ file, ms });
  // Buffered per file, so concurrent scripts cannot interleave their lines.
  if (killed || exitCode !== 0) {
    const outcome = killed ? `was killed after exceeding ${scriptTimeoutMs}ms` : `exited with code ${exitCode}`;
    console.error(`\n=== ${file} ${outcome} (${ms}ms) ===`);
    failures.push({ file, exitCode, killed });
  }
  process.stdout.write(stdout);
  process.stderr.write(stderr);
}

await Promise.all(Array.from({ length: concurrency }, async () => {
  while (next < files.length) {
    await run(files[next++]!);
  }
}));

if (failures.length > 0) {
  throw new Error(`${failures.length}/${files.length} permanent regression scripts failed: ${
    failures.map((failure) =>
      `${failure.file} (${failure.killed ? `killed after ${scriptTimeoutMs}ms` : `exit ${failure.exitCode}`})`
    ).join(", ")
  }`);
}

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
const slowest = timings
  .sort((a, b) => b.ms - a.ms)
  .slice(0, 3)
  .map((timing) => `${timing.file} ${timing.ms}ms`)
  .join(", ");
console.log(`OK: ${files.length} permanent regression scripts passed in ${seconds}s (concurrency ${concurrency})`);
console.log(`slowest: ${slowest}`);
