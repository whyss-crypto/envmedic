import { existsSync } from "node:fs";
import { join } from "node:path";
import { execa } from "execa";
import type { CheckResult } from "../core/health-score.js";
import {
  findEnvReferences,
  loadEnvFiles,
  SECRET_NAME_HINT,
} from "../core/env-scan.js";

export interface EnvIntelligence {
  required: string[];
  missing: string[];
}

async function isGitTracked(cwd: string, file: string): Promise<boolean> {
  try {
    const { stdout } = await execa("git", ["ls-files", "--error-unmatch", file], {
      cwd,
    });
    return stdout.trim() === file;
  } catch {
    return false;
  }
}

export async function checkEnv(
  cwd: string,
  snapshotEnv: string[],
): Promise<{ results: CheckResult[]; intel: EnvIntelligence }> {
  const results: CheckResult[] = [];
  const scanned = findEnvReferences(cwd);
  const required = [...new Set([...scanned, ...snapshotEnv])].sort();
  const { byFile, realKeys, exampleKeys } = loadEnvFiles(cwd);

  const hasEnv = existsSync(join(cwd, ".env"));
  const hasLocal = existsSync(join(cwd, ".env.local"));
  const hasExample = existsSync(join(cwd, ".env.example"));

  if (!hasEnv && !hasLocal) {
    results.push({
      name: "Env files",
      category: "env",
      status: required.length > 0 ? "warn" : "ok",
      message:
        required.length > 0
          ? "Missing .env / .env.local (project references env vars)"
          : "No .env / .env.local (none required)",
      detail: required.length > 0 ? "Run `envmedic fix` to generate a template." : undefined,
    });
  } else {
    const present = [hasEnv && ".env", hasLocal && ".env.local"].filter(Boolean).join(", ");
    results.push({
      name: "Env files",
      category: "env",
      status: "ok",
      message: `Found ${present}`,
    });
  }

  if (required.length > 0 && !hasExample) {
    results.push({
      name: ".env.example",
      category: "env",
      status: "warn",
      message: ".env.example missing — teammates must guess required vars",
      detail: "Run `envmedic fix` to generate it (names only, no secrets).",
    });
  } else if (hasExample) {
    const uncovered = required.filter((v) => !exampleKeys.has(v));
    results.push({
      name: ".env.example",
      category: "env",
      status: uncovered.length === 0 ? "ok" : "warn",
      message:
        uncovered.length === 0
          ? ".env.example covers all detected variables"
          : `.env.example incomplete — missing: ${uncovered.join(", ")}`,
    });
  }

  // Per-variable status (names only — values are NEVER printed).
  // Only .env / .env.local count as "set" (.env.example is documentation),
  // plus variables exported in the current shell (CI/Docker without files).
  const fromShell = required.filter((v) => !realKeys.has(v) && process.env[v] !== undefined);
  const shellSet = new Set(fromShell);
  const missing = required.filter((v) => !realKeys.has(v) && !shellSet.has(v));
  const presentVars = required.filter((v) => realKeys.has(v) || shellSet.has(v));
  if (presentVars.length > 0) {
    results.push({
      name: "Environment variables",
      category: "env",
      status: missing.length === 0 ? "ok" : "warn",
      message:
        missing.length === 0
          ? `${presentVars.length} required variable(s) set`
          : `${presentVars.length} set, ${missing.length} missing`,
      detail: presentVars
        .map((v) => (shellSet.has(v) ? `✅ ${v} (from shell environment)` : `✅ ${v}`))
        .join("  "),
    });
  }

  for (const name of missing) {
    results.push({
      name: `Env ${name}`,
      category: "env",
      status: "fail",
      message: `${name} missing — add it to .env.local`,
      detail: "Add it to .env.local (never commit real secrets).",
    });
  }
  if (required.length === 0) {
    results.push({
      name: "Environment variables",
      category: "env",
      status: "ok",
      message: "No process.env references detected",
    });
  }

  // Committed-secret warning: real env files tracked by git.
  for (const file of [".env", ".env.local"] as const) {
    if (!(await isGitTracked(cwd, file))) continue;
    const trackedKeys = byFile[file] ?? [];
    const secretish = trackedKeys.filter((k) => SECRET_NAME_HINT.test(k));
    results.push({
      name: "Secret hygiene",
      category: "env",
      status: "warn",
      message:
        secretish.length > 0
          ? `${file} is git-tracked and looks secret-bearing (${secretish.slice(0, 3).join(", ")})`
          : `${file} is git-tracked — usually it should be ignored`,
      detail: `Add \`${file}\` to .gitignore and rotate any exposed secrets.`,
    });
  }

  return { results, intel: { required, missing } };
}
