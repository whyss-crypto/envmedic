import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  calculateHealthScore,
  healthLabel,
  type CheckResult,
} from "./health-score.js";
import {
  detectFramework,
  detectPackageManager,
  installCommand,
  nodeMajorRequirement,
  portWorkaroundCommand,
  readPackageJson,
  startCommand,
  type PackageManager,
} from "./project.js";
import { readSnapshot } from "./snapshot.js";
import { checkNode } from "../checks/node.js";
import { checkPackageManager } from "../checks/package-manager.js";
import { checkDependencies } from "../checks/dependencies.js";
import { checkProject } from "../checks/project.js";
import { checkEnv } from "../checks/env.js";
import { checkPorts, type PortInfo } from "../checks/ports.js";
import { checkGit } from "../checks/git.js";

export interface RecommendedFix {
  title: string;
  /** Exact command to run (never contains secret values). */
  command?: string | undefined;
  /** True when `envmedic fix` applies it automatically. */
  auto: boolean;
}

export interface Diagnosis {
  cwd: string;
  framework: string;
  packageManager: PackageManager;
  nodeVersion: string;
  scripts: Record<string, string>;
  hasPackageJson: boolean;
  pkgCorrupt: boolean;
  nodeModulesPresent: boolean;
  results: CheckResult[];
  fixes: RecommendedFix[];
  score: number;
  label: string;
  envRequired: string[];
  envMissing: string[];
  ports: PortInfo[];
  expectedPorts: number[];
  startCommand: string;
}

export async function runDiagnosis(
  cwd: string,
  opts?: { ports?: number[] | undefined },
): Promise<Diagnosis> {
  const { exists: hasPackageJson, corrupt: pkgCorrupt, data: pkg } = readPackageJson(cwd);
  const pm = hasPackageJson ? detectPackageManager(cwd, pkg) : "npm";
  const framework = hasPackageJson ? detectFramework(pkg) : "Unknown";
  const nodeModulesPresent = existsSync(join(cwd, "node_modules"));
  const scripts = pkg.scripts ?? {};

  const snapshot = readSnapshot(cwd);
  const expectedPorts = opts?.ports ?? snapshot?.ports ?? [3000];

  const results: CheckResult[] = [];
  results.push(...(await checkNode(nodeMajorRequirement(pkg), pm)));
  if (hasPackageJson) {
    results.push(...checkPackageManager(cwd, pm, hasPackageJson));
    results.push(...checkDependencies(cwd, pkg, hasPackageJson, pm, pkgCorrupt));
    results.push(...checkProject(pkg, hasPackageJson, pm, nodeModulesPresent, pkgCorrupt));
  } else {
    results.push(...checkDependencies(cwd, pkg, false, pm));
    results.push(...checkProject(pkg, false, pm, false));
  }

  const snapshotEnv = snapshot?.env ?? [];
  const { results: envResults, intel } = await checkEnv(cwd, snapshotEnv);
  results.push(...envResults);

  const { results: portResults, infos } = await checkPorts(expectedPorts, {
    scripts,
    pm,
  });
  results.push(...portResults);
  results.push(...(await checkGit(cwd)));

  const { score } = calculateHealthScore(results);
  const fixes = buildFixes({ cwd, pm, scripts, hasPackageJson, pkgCorrupt, nodeModulesPresent, intel, infos });

  return {
    cwd,
    framework,
    packageManager: pm,
    nodeVersion: process.version,
    scripts,
    hasPackageJson,
    pkgCorrupt,
    nodeModulesPresent,
    results,
    fixes,
    score,
    label: healthLabel(score),
    envRequired: intel.required,
    envMissing: intel.missing,
    ports: infos,
    expectedPorts,
    startCommand: startCommand(scripts, pm),
  };
}

function buildFixes(args: {
  cwd: string;
  pm: PackageManager;
  scripts: Record<string, string>;
  hasPackageJson: boolean;
  pkgCorrupt: boolean;
  nodeModulesPresent: boolean;
  intel: { required: string[]; missing: string[] };
  infos: PortInfo[];
}): RecommendedFix[] {
  const fixes: RecommendedFix[] = [];
  const install = installCommand(args.pm);

  // No point suggesting install with no manifest — or an unparsable one.
  if (!args.nodeModulesPresent && args.hasPackageJson && !args.pkgCorrupt) {
    fixes.push({ title: "Install missing dependencies", command: install, auto: true });
  }

  const hasExample = existsSync(join(args.cwd, ".env.example"));
  const hasLocal = existsSync(join(args.cwd, ".env.local")) || existsSync(join(args.cwd, ".env"));
  if (args.intel.required.length > 0 && !hasExample) {
    fixes.push({ title: "Create .env.example (names only, no secrets)", command: "envmedic fix", auto: true });
  }
  if (args.intel.required.length > 0 && !hasLocal) {
    fixes.push({ title: "Create .env.local template (empty values)", command: "envmedic fix", auto: true });
  }
  for (const name of args.intel.missing) {
    fixes.push({ title: `Add ${name} to .env.local`, auto: false });
  }
  for (const info of args.infos) {
    if (info.occupied) {
      const alt = info.alternatives[0];
      fixes.push({
        title: alt
          ? `Stop the process on port ${info.port} or use ${alt}`
          : `Stop the process using port ${info.port}`,
        command: alt ? portWorkaroundCommand(alt, args.scripts, args.pm) : undefined,
        auto: false,
      });
    }
  }

  return fixes;
}
