import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult } from "../core/health-score.js";
import { lockfileFor, type PackageManager } from "../core/project.js";

export function checkPackageManager(
  cwd: string,
  pm: PackageManager,
  hasPackageJson: boolean,
): CheckResult[] {
  if (!hasPackageJson) return [];

  const lockfile = lockfileFor(pm);
  if (existsSync(join(cwd, lockfile))) {
    return [
      {
        name: "Package manager",
        category: "dependencies",
        status: "ok",
        message: `${pm} (${lockfile} found)`,
      },
    ];
  }

  // A foreign lockfile hints the project uses a different manager.
  const others: Array<[string, PackageManager]> = [
    ["package-lock.json", "npm"],
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lockb", "bun"],
    ["bun.lock", "bun"],
  ];
  for (const [file, owner] of others) {
    if (owner !== pm && existsSync(join(cwd, file))) {
      return [
        {
          name: "Package manager",
          category: "dependencies",
          status: "warn",
          message: `Using ${pm}, but ${file} suggests ${owner}`,
          detail: `Use ${owner} install, or delete ${file} if you migrated.`,
        },
      ];
    }
  }

  return [
    {
      name: "Package manager",
      category: "dependencies",
      status: "warn",
      message: `${pm} detected, but no ${lockfile} found`,
      detail: `Run \`${pm === "npm" ? "npm install" : `${pm} install`}\` to generate it.`,
      fix: pm === "npm" ? "npm install" : `${pm} install`,
    },
  ];
}
