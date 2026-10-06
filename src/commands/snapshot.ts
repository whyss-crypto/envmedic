import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import ora from "ora";
import {
  detectPackageManager,
  nodeMajorRequirement,
  readPackageJson,
  startCommand,
} from "../core/project.js";
import {
  SNAPSHOT_FILE,
  writeSnapshot,
  type EnvMedicJson,
} from "../core/snapshot.js";
import { findEnvReferences } from "../core/env-scan.js";
import { readSnapshot } from "../core/snapshot.js";

function currentMajor(): number {
  return Number(process.version.replace(/^v/, "").split(".")[0]);
}

export async function runSnapshot(
  cwd: string,
  opts?: { force?: boolean },
): Promise<void> {
  const existing = join(cwd, SNAPSHOT_FILE);
  if (existsSync(existing) && !opts?.force) {
    console.log(
      chalk.yellow(
        `${SNAPSHOT_FILE} already exists. Re-run with --force to overwrite.\n`,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const spinner = ora("Scanning project...").start();
  let data: EnvMedicJson;
  try {
    const { exists, corrupt, data: pkg } = readPackageJson(cwd);
    if (!exists) {
      spinner.fail("No package.json found here.");
      process.exitCode = 1;
      return;
    }
    if (corrupt) {
      spinner.fail("package.json exists but is not valid JSON — fix it first.");
      process.exitCode = 1;
      return;
    }

    const pm = detectPackageManager(cwd, pkg);
    const previous = readSnapshot(cwd);
    const scanned = findEnvReferences(cwd);
    const env = [...new Set([...(previous?.env ?? []), ...scanned])].sort();

    const engineNode = nodeMajorRequirement(pkg);
    const engineMajor = engineNode?.match(/(\d+)/)?.[1];
    const node = engineMajor ? `${engineMajor}.x` : `${currentMajor()}.x`;

    const scripts = pkg.scripts ?? {};
    const run = (s: string) => (pm === "npm" ? `npm run ${s}` : `${pm} ${s}`);

    data = {
      runtime: { node, packageManager: pm },
      commands: {
        // Prefer an explicit dev script; otherwise reuse whatever starts the app.
        dev: scripts["dev"] ? run("dev") : startCommand(scripts, pm),
        ...(scripts["build"] ? { build: run("build") } : {}),
      },
      ports: previous?.ports ?? [3000],
      env,
    };
  } catch (err) {
    spinner.fail(`Snapshot failed: ${(err as Error).message}`);
    throw err;
  }
  const path = writeSnapshot(cwd, data);
  spinner.succeed(`Wrote ${path}`);

  console.log(chalk.dim(`\nTeammates can now run:\n  envmedic bootstrap\n`));
}
