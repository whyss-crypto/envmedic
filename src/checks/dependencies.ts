import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult } from "../core/health-score.js";
import { satisfiesRange } from "../core/semver.js";
import {
  installCommand,
  type PackageJson,
  type PackageManager,
} from "../core/project.js";

const MAX_REPORTED = 5;

export function checkDependencies(
  cwd: string,
  pkg: PackageJson,
  hasPackageJson: boolean,
  pm: PackageManager,
  pkgCorrupt = false,
): CheckResult[] {
  if (!hasPackageJson) {
    return [
      {
        name: "package.json",
        category: "dependencies",
        status: "fail",
        message: "package.json missing",
        detail: "Run `npm init -y` to create one.",
      },
    ];
  }

  if (pkgCorrupt) {
    return [
      {
        name: "package.json",
        category: "dependencies",
        status: "fail",
        message: "package.json exists but is not valid JSON",
        detail: "Fix the syntax error — run `npx --yes jsonlint-cli package.json` or open it in an editor.",
      },
    ];
  }

  const results: CheckResult[] = [
    {
      name: "package.json",
      category: "dependencies",
      status: "ok",
      message: "package.json found",
    },
  ];

  const modulesDir = join(cwd, "node_modules");
  if (!existsSync(modulesDir)) {
    results.push({
      name: "Dependencies",
      category: "dependencies",
      status: "fail",
      message: "node_modules missing — dependencies not installed",
      detail: `Run \`${installCommand(pm)}\`.`,
      fix: installCommand(pm),
    });
    return results;
  }

  const allDeps: Array<[string, string]> = [
    ...Object.entries(pkg.dependencies ?? {}),
    ...Object.entries(pkg.devDependencies ?? {}),
  ];

  if (allDeps.length === 0) {
    results.push({
      name: "Dependencies",
      category: "dependencies",
      status: "ok",
      message: "No dependencies declared",
    });
    return results;
  }

  const missing: string[] = [];
  const mismatched: string[] = [];

  for (const [name, expected] of allDeps) {
    // Skip file:/link: references — resolution check is path-based there.
    if (/^(file|link|workspace):/.test(expected)) continue;
    const depPkgPath = join(modulesDir, name, "package.json");
    if (!existsSync(depPkgPath)) {
      missing.push(name);
      continue;
    }
    try {
      const installed = JSON.parse(readFileSync(depPkgPath, "utf-8")) as {
        version?: string;
      };
      if (installed.version && satisfiesRange(installed.version, expected) === false) {
        mismatched.push(`${name} (expects ${expected}, installed ${installed.version})`);
      }
    } catch {
      // Unreadable dep manifest — treat as broken install.
      missing.push(name);
    }
  }

  if (missing.length === 0 && mismatched.length === 0) {
    results.push({
      name: "Dependencies",
      category: "dependencies",
      status: "ok",
      message: `${allDeps.length} dependencies resolved`,
    });
    return results;
  }

  for (const name of missing.slice(0, MAX_REPORTED)) {
    const expected = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? "";
    results.push({
      name: `Dependency ${name}`,
      category: "dependencies",
      status: "fail",
      message: `${name} cannot be resolved${expected ? ` (package.json expects ${expected})` : ""}`,
      detail: `Recommended: \`${installCommand(pm)}\``,
      fix: installCommand(pm),
    });
  }
  if (missing.length > MAX_REPORTED) {
    results.push({
      name: "Dependencies",
      category: "dependencies",
      status: "fail",
      message: `…and ${missing.length - MAX_REPORTED} more missing`,
      fix: installCommand(pm),
    });
  }
  for (const item of mismatched.slice(0, MAX_REPORTED)) {
    results.push({
      name: `Dependency ${item.split(" ")[0]}`,
      category: "dependencies",
      status: "warn",
      message: `Version mismatch — ${item}`,
      detail: `Recommended: \`${installCommand(pm)}\``,
      fix: installCommand(pm),
    });
  }

  return results;
}
