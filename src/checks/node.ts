import { execa } from "execa";
import type { CheckResult } from "../core/health-score.js";
import { satisfiesRange } from "../core/semver.js";
import type { PackageManager } from "../core/project.js";

export async function checkNode(
  engineRange: string | null,
  pm: PackageManager = "npm",
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const nodeVersion = process.version; // e.g. v22.14.0
  const major = Number(nodeVersion.replace(/^v/, "").split(".")[0]);

  if (Number.isNaN(major)) {
    results.push({
      name: "Node.js",
      category: "runtime",
      status: "fail",
      message: `Could not parse Node version (${nodeVersion})`,
    });
  } else if (major < 18) {
    results.push({
      name: "Node.js",
      category: "runtime",
      status: "fail",
      message: `${nodeVersion} is too old — Node 18+ required`,
      detail: "Install a current LTS from https://nodejs.org",
    });
  } else {
    results.push({
      name: "Node.js",
      category: "runtime",
      status: "ok",
      message: `${nodeVersion}`,
    });
  }

  // Package-manager binary (not hardcoded to npm — bun/pnpm-only images exist).
  try {
    const { stdout } = await execa(pm, ["--version"]);
    results.push({
      name: pm === "npm" ? "npm" : `Package manager binary (${pm})`,
      category: "runtime",
      status: "ok",
      message: `${pm} v${stdout.trim()}`,
    });
  } catch {
    results.push({
      name: pm === "npm" ? "npm" : `Package manager binary (${pm})`,
      category: "runtime",
      status: "fail",
      message: `${pm} not found on PATH`,
    });
  }

  if (engineRange) {
    const plain = nodeVersion.replace(/^v/, "");
    const verdict = satisfiesRange(plain, engineRange);
    if (verdict === true) {
      results.push({
        name: "Node engine",
        category: "runtime",
        status: "ok",
        message: `${nodeVersion} satisfies engines ${engineRange}`,
      });
    } else if (verdict === false) {
      results.push({
        name: "Node engine",
        category: "runtime",
        status: "fail",
        message: `Node version mismatch — project requires ${engineRange}, running ${nodeVersion}`,
        detail: "Use nvm/fnm to switch: `nvm use`",
      });
    } else {
      results.push({
        name: "Node engine",
        category: "runtime",
        status: "warn",
        message: `Could not verify engines range "${engineRange}"`,
      });
    }
  }

  return results;
}
