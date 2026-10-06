import { execa } from "execa";
import type { CheckResult } from "../core/health-score.js";

export async function checkGit(cwd: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  try {
    const { stdout } = await execa("git", ["--version"]);
    results.push({
      name: "Git",
      category: "git",
      status: "ok",
      message: stdout.trim(),
    });
  } catch {
    results.push({
      name: "Git",
      category: "git",
      status: "fail",
      message: "git not found on PATH",
      detail: "Install git from https://git-scm.com/downloads",
    });
    return results;
  }

  try {
    await execa("git", ["rev-parse", "--is-inside-work-tree"], { cwd });
  } catch {
    results.push({
      name: "Git repo",
      category: "git",
      status: "warn",
      message: "Not inside a git repository",
      detail: "Run `git init` if you want version control here.",
    });
    return results;
  }

  let branch = "";
  try {
    const { stdout } = await execa("git", ["branch", "--show-current"], { cwd });
    branch = stdout.trim();
  } catch {
    branch = "";
  }
  results.push({
    name: "Git repo",
    category: "git",
    status: "ok",
    message: branch ? `On branch ${branch}` : "Inside a git repository",
  });

  try {
    const { stdout } = await execa("git", ["status", "--porcelain"], { cwd });
    if (stdout.trim()) {
      results.push({
        name: "Git status",
        category: "git",
        status: "warn",
        message: "Uncommitted changes present",
      });
    } else {
      results.push({
        name: "Git status",
        category: "git",
        status: "ok",
        message: "Working tree clean",
      });
    }
  } catch {
    // status check is best-effort; skip silently.
  }

  return results;
}
