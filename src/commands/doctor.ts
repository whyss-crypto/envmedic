import chalk from "chalk";
import ora from "ora";
import { runDiagnosis, type Diagnosis } from "../core/diagnose.js";

const ICON = { ok: "✅", warn: "🟡", fail: "🔴" } as const;

function header(): void {
  console.log(chalk.cyan("╭────────────────────────────────────────────╮"));
  console.log(chalk.cyan("│") + chalk.bold("              ENVMEDIC v0.1                 ") + chalk.cyan("│"));
  console.log(chalk.cyan("│") + "          Environment Health Check          " + chalk.cyan("│"));
  console.log(chalk.cyan("╰────────────────────────────────────────────╯"));
}

function scoreColor(score: number): (s: string) => string {
  if (score >= 90) return chalk.green;
  if (score >= 60) return chalk.yellow;
  return chalk.red;
}

export function printDiagnosis(d: Diagnosis): void {
  header();
  console.log(chalk.bold("\nPROJECT"));
  console.log(`  Framework       ${d.framework}`);
  console.log(`  Runtime         Node.js ${d.nodeVersion}`);
  console.log(`  Package Manager ${d.packageManager}`);

  console.log(`\n${chalk.bold("HEALTH SCORE:")} ${scoreColor(d.score)(`${d.score}/100 (${d.label})`)}\n`);

  for (const r of d.results) {
    const line = `  ${ICON[r.status]} ${r.message}`;
    const colored =
      r.status === "ok" ? chalk.green(line) : r.status === "warn" ? chalk.yellow(line) : chalk.red(line);
    console.log(`${colored} ${chalk.dim(`[${r.name}]`)}`);
    if (r.detail) {
      for (const dl of r.detail.split("\n")) console.log(`      ${chalk.dim(dl)}`);
    }
  }

  if (d.fixes.length > 0) {
    console.log(chalk.bold("\nRECOMMENDED FIXES\n"));
    d.fixes.forEach((f, i) => {
      const tag = f.auto ? chalk.green("[auto]") : chalk.yellow("[manual]");
      console.log(`  ${i + 1}. ${f.title} ${tag}`);
      if (f.command) console.log(`     ${chalk.dim("$")} ${chalk.cyan(f.command)}`);
    });
    console.log(chalk.dim("\nRun:\n  envmedic fix\n"));
  } else {
    console.log(chalk.green("\nEverything looks good. Happy hacking.\n"));
  }
}

export async function runDoctor(cwd: string, opts?: { json?: boolean | undefined; ports?: number[] | undefined }): Promise<void> {
  const spinner = ora("Running EnvMedic checks...").start();
  let diagnosis: Diagnosis;
  try {
    diagnosis = await runDiagnosis(cwd, { ports: opts?.ports });
  } catch (err) {
    spinner.fail(`Diagnosis failed: ${(err as Error).message}`);
    throw err;
  }
  spinner.stop();

  if (opts?.json) {
    console.log(
      JSON.stringify(
        {
          project: {
            framework: diagnosis.framework,
            runtime: `Node.js ${diagnosis.nodeVersion}`,
            packageManager: diagnosis.packageManager,
          },
          score: diagnosis.score,
          label: diagnosis.label,
          results: diagnosis.results,
          fixes: diagnosis.fixes,
          env: { required: diagnosis.envRequired, missing: diagnosis.envMissing },
          ports: diagnosis.ports,
          startCommand: diagnosis.startCommand,
        },
        null,
        2,
      ),
    );
    return;
  }

  printDiagnosis(diagnosis);
}
