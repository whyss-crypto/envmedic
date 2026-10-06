import type { CheckResult } from "../core/health-score.js";
import {
  detectFramework,
  type PackageJson,
  type PackageManager,
} from "../core/project.js";

export function checkProject(
  pkg: PackageJson,
  hasPackageJson: boolean,
  pm: PackageManager,
  nodeModulesPresent: boolean,
  pkgCorrupt = false,
): CheckResult[] {
  if (!hasPackageJson) {
    // One root cause (no package.json) already fails in dependencies —
    // report warn here so the score isn't penalized twice.
    return [
      {
        name: "Project",
        category: "build",
        status: "warn",
        message: "Skipped — no package.json to assess",
      },
    ];
  }

  if (pkgCorrupt) {
    return [
      {
        name: "Project",
        category: "build",
        status: "fail",
        message: "Cannot assess project — package.json is corrupt",
      },
    ];
  }

  const framework = detectFramework(pkg);
  const results: CheckResult[] = [
    {
      name: "Framework",
      category: "build",
      status: "ok",
      message: framework,
    },
  ];

  const scripts = pkg.scripts ?? {};
  const names = Object.keys(scripts);
  const run = (s: string) => (pm === "npm" ? `npm run ${s}` : `${pm} ${s}`);

  if (names.length === 0) {
    results.push({
      name: "Project scripts",
      category: "build",
      status: "warn",
      message: "No scripts defined in package.json",
    });
  } else {
    const shown = ["dev", "build", "start"]
      .filter((s) => scripts[s])
      .map((s) => `${s} (${run(s)})`);
    results.push({
      name: "Project scripts",
      category: "build",
      status: "ok",
      message: shown.length > 0 ? shown.join(", ") : `${names.length} script(s)`,
    });
  }

  if (!scripts["build"]) {
    results.push({
      name: "Build readiness",
      category: "build",
      status: "warn",
      message: "No build script — nothing to validate for production",
    });
  } else if (!nodeModulesPresent) {
    results.push({
      name: "Build readiness",
      category: "build",
      status: "fail",
      message: "Cannot build — dependencies not installed",
      fix: pm === "npm" ? "npm install" : `${pm} install`,
    });
  } else {
    results.push({
      name: "Build readiness",
      category: "build",
      status: "ok",
      message: `Ready to validate with \`${run("build")}\``,
    });
  }

  return results;
}
