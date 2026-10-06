import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const EnvMedicJsonSchema = z.object({
  runtime: z.object({
    node: z.string(),
    packageManager: z.enum(["npm", "pnpm", "yarn", "bun"]),
  }),
  commands: z.object({
    dev: z.string(),
    build: z.string().optional(),
  }),
  ports: z.array(z.number().int().min(1).max(65535)),
  env: z.array(z.string()),
});
export type EnvMedicJson = z.infer<typeof EnvMedicJsonSchema>;

export const SNAPSHOT_FILE = "envmedic.json";

export function readSnapshot(cwd: string): EnvMedicJson | null {
  const path = join(cwd, SNAPSHOT_FILE);
  if (!existsSync(path)) return null;
  try {
    const parsed = EnvMedicJsonSchema.safeParse(
      JSON.parse(readFileSync(path, "utf-8")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeSnapshot(cwd: string, data: EnvMedicJson): string {
  const path = join(cwd, SNAPSHOT_FILE);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  return path;
}
