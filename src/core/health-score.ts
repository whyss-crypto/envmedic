import { z } from "zod";

export const CheckStatusSchema = z.enum(["ok", "warn", "fail"]);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

export const CheckCategorySchema = z.enum([
  "runtime",
  "dependencies",
  "env",
  "ports",
  "build",
  "git",
]);
export type CheckCategory = z.infer<typeof CheckCategorySchema>;

export const CheckResultSchema = z.object({
  name: z.string(),
  status: CheckStatusSchema,
  category: CheckCategorySchema,
  message: z.string(),
  detail: z.string().optional(),
  /** Exact manual command the user can run (never contains secret values). */
  fix: z.string().optional(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

/**
 * Modular health-score weights (sum = 100). Change values here to rescore.
 */
export const CATEGORY_WEIGHTS: Record<CheckCategory, number> = {
  runtime: 20,
  dependencies: 20,
  env: 20,
  ports: 15,
  build: 15,
  git: 10,
};

const STATUS_VALUE: Record<CheckStatus, number> = { ok: 1, warn: 0.5, fail: 0 };

export interface HealthScore {
  score: number;
  max: number;
  byCategory: Record<CheckCategory, { score: number; weight: number }>;
}

export function calculateHealthScore(results: CheckResult[]): HealthScore {
  const byCategory = {} as HealthScore["byCategory"];
  let score = 0;

  for (const [category, weight] of Object.entries(CATEGORY_WEIGHTS) as Array<
    [CheckCategory, number]
  >) {
    const items = results.filter((r) => r.category === category);
    if (items.length === 0) {
      byCategory[category] = { score: weight, weight };
      score += weight;
      continue;
    }
    const avg =
      items.reduce((sum, r) => sum + STATUS_VALUE[r.status], 0) / items.length;
    const catScore = Math.round(avg * weight);
    byCategory[category] = { score: catScore, weight };
    score += catScore;
  }

  return { score, max: 100, byCategory };
}

export function healthLabel(score: number): string {
  if (score >= 90) return "Healthy";
  if (score >= 60) return "Needs attention";
  return "Critical";
}
