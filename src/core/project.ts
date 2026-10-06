import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface PackageJson {
  name?: string;
  version?: string;
  private?: boolean;
  packageManager?: string;
  engines?: { node?: string };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function readPackageJson(cwd: string): {
  exists: boolean;
  corrupt: boolean;
  data: PackageJson;
} {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) return { exists: false, corrupt: false, data: {} };
  try {
    const data = JSON.parse(readFileSync(pkgPath, "utf-8")) as PackageJson;
    return { exists: true, corrupt: false, data };
  } catch {
    // File is present but unparsable — distinct from "missing".
    return { exists: true, corrupt: true, data: {} };
  }
}

const LOCKFILES: Array<{ file: string; pm: PackageManager }> = [
  { file: "bun.lockb", pm: "bun" },
  { file: "bun.lock", pm: "bun" },
  { file: "pnpm-lock.yaml", pm: "pnpm" },
  { file: "yarn.lock", pm: "yarn" },
  { file: "package-lock.json", pm: "npm" },
];

export function detectPackageManager(cwd: string, pkg: PackageJson): PackageManager {
  // Explicit packageManager field wins (e.g. "packageManager": "pnpm@9.1.0").
  if (pkg.packageManager) {
    const name = pkg.packageManager.split("@")[0];
    if (name === "pnpm" || name === "yarn" || name === "bun" || name === "npm") {
      return name;
    }
  }
  for (const { file, pm } of LOCKFILES) {
    if (existsSync(join(cwd, file))) return pm;
  }
  return "npm";
}

export function lockfileFor(pm: PackageManager): string {
  switch (pm) {
    case "pnpm":
      return "pnpm-lock.yaml";
    case "yarn":
      return "yarn.lock";
    case "bun":
      return "bun.lockb";
    default:
      return "package-lock.json";
  }
}

export function installCommand(pm: PackageManager): string {
  return pm === "npm" ? "npm install" : `${pm} install`;
}

/** Frameworks EnvMedic understands in v0.1 (Node ecosystem only). */
export function detectFramework(pkg: PackageJson): string {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps["next"]) return "Next.js";
  if (deps["gatsby"]) return "Gatsby";
  if (deps["astro"]) return "Astro";
  if (deps["@remix-run/react"] || deps["@react-router/dev"]) return "React Router";
  if (deps["vite"]) return "Vite";
  if (deps["express"] || deps["fastify"] || deps["hono"]) return "Node.js API";
  if (deps["react"] || deps["react-dom"]) return "React";
  return "Node.js";
}

export function startCommand(
  scripts: Record<string, string> | undefined,
  pm: PackageManager,
): string {
  const run = (s: string) => (pm === "npm" ? `npm run ${s}` : `${pm} ${s}`);
  if (scripts?.["dev"]) return run("dev");
  if (scripts?.["start"]) return pm === "npm" ? "npm start" : `${pm} start`;
  return run("dev");
}

/**
 * Suggested command for running the dev server on an alternate port.
 * PowerShell syntax on Windows, POSIX elsewhere; uses the detected manager.
 */
export function portWorkaroundCommand(
  port: number,
  scripts: Record<string, string> | undefined,
  pm: PackageManager,
): string {
  const devCmd = startCommand(scripts ?? {}, pm);
  return process.platform === "win32" ? `$env:PORT=${port}; ${devCmd}` : `PORT=${port} ${devCmd}`;
}

export function nodeMajorRequirement(pkg: PackageJson): string | null {
  return pkg.engines?.node?.trim() || null;
}
