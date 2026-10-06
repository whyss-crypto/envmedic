import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
  ".vercel",
  // Demo/fixture trees are intentionally broken — never scan them.
  "demo",
  "fixtures",
  "examples",
]);
const SCAN_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const MAX_FILES = 600;
const MAX_FILE_BYTES = 250_000;

const PROCESS_ENV_RE = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g;
const IMPORT_META_ENV_RE = /import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g;

/** Looks like a secret key name (used for warnings — values are never read). */
export const SECRET_NAME_HINT = /KEY|SECRET|TOKEN|PASSWORD|PRIVATE|CREDENTIAL|API[_-]?KEY/i;

/** Recursively find `process.env.X` / `import.meta.env.X` references. */
export function findEnvReferences(cwd: string): string[] {
  const found = new Set<string>();
  let visited = 0;

  function walk(dir: string): void {
    if (visited > MAX_FILES) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (visited > MAX_FILES) return;
      if (entry.startsWith(".")) {
        // Still scan dotfiles like `next.config.ts`? No — skip hidden dirs except
        // explicit config files handled below. Keep it simple: skip hidden.
        if (![".env.example"].includes(entry)) continue;
      }
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        // Nested projects (own package.json) manage their own environment —
        // their references must not count against this project.
        if (existsSync(join(full, "package.json"))) continue;
        walk(full);
      } else {
        const ext = entry.slice(entry.lastIndexOf("."));
        if (!SCAN_EXTS.has(ext)) continue;
        if (stat.size > MAX_FILE_BYTES) continue;
        visited++;
        let text: string;
        try {
          text = readFileSync(full, "utf-8");
        } catch {
          continue;
        }
        for (const re of [PROCESS_ENV_RE, IMPORT_META_ENV_RE]) {
          re.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = re.exec(text)) !== null) {
            const name = m[1] as string;
            // Skip NODE_ENV and friends that are always available.
            if (["NODE_ENV", "PORT"].includes(name)) continue;
            // Skip single-letter matches — almost always prose like
            // "process.env.X" in a comment, never a real variable.
            if (name.length <= 1) continue;
            found.add(name);
          }
        }
      }
    }
  }

  walk(cwd);
  return [...found].sort();
}

export interface EnvFiles {
  /** Variable names per file (names only — values are never returned). */
  byFile: Record<string, string[]>;
  /** Names set in real env files (.env, .env.local) — what the runtime sees. */
  realKeys: Set<string>;
  /** Union of names across .env, .env.local, .env.example. */
  allKeys: Set<string>;
  exampleKeys: Set<string>;
}

export function loadEnvFiles(cwd: string): EnvFiles {
  const byFile: Record<string, string[]> = {};
  const allKeys = new Set<string>();
  const realKeys = new Set<string>();
  for (const file of [".env", ".env.local", ".env.example"]) {
    const path = join(cwd, file);
    if (!existsSync(path)) continue;
    try {
      const parsed = dotenv.parse(readFileSync(path, "utf-8"));
      const keys = Object.keys(parsed);
      byFile[file] = keys;
      for (const k of keys) {
        allKeys.add(k);
        if (file !== ".env.example") realKeys.add(k);
      }
    } catch {
      byFile[file] = [];
    }
  }
  return { byFile, realKeys, allKeys, exampleKeys: new Set(byFile[".env.example"] ?? []) };
}
