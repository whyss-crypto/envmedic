import chalk from "chalk";
import ora from "ora";
import { runDiagnosis, type Diagnosis } from "../core/diagnose.js";
import { runFix } from "./fix.js";

export async function runBootstrap(cwd: string): Promise<void> {
  console.log(chalk.cyan("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log(chalk.bold("        ENVMEDIC BOOTSTRAP"));
  console.log(chalk.cyan("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));

  const scan = ora("Detecting project...").start();
  let before: Diagnosis;
  try {
    before = await runDiagnosis(cwd);
  } catch (err) {
    scan.fail(`Detection failed: ${(err as Error).message}`);
    throw err;
  }
  scan.succeed("Project detected");

  console.log(`  Framework       ${before.framework}`);
  console.log(`  Runtime         Node.js ${before.nodeVersion}`);
  console.log(`  Package Manager ${before.packageManager}`);
  console.log(`  Health          ${before.score}/100 (${before.label})\n`);

  const blockers = before.results.filter((r) => r.status === "fail");
  if (blockers.length === 0 && before.envMissing.length === 0) {
    console.log(chalk.green("Already healthy — nothing to do."));
  } else {
    console.log(chalk.bold("Fixing safe issues...\n"));
    await runFix(cwd);
  }

  // Lightweight validation: re-diagnose instead of running a full build.
  const verify = ora("Validating...").start();
  let after: Diagnosis;
  try {
    after = await runDiagnosis(cwd);
  } catch (err) {
    verify.fail(`Validation failed: ${(err as Error).message}`);
    throw err;
  }
  verify.succeed("Validation complete");

  const remaining = after.results.filter((r) => r.status === "fail");
  const remainingEnv = after.envMissing;

  if (remaining.length === 0 && remainingEnv.length === 0) {
    console.log(chalk.cyan("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log(chalk.green(chalk.bold("        PROJECT READY")));
    console.log(chalk.cyan("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));
    console.log(`Run:\n  ${chalk.cyan(after.startCommand)}\n`);
  } else {
    console.log(chalk.yellow(chalk.bold("\nRemaining blockers:\n")));
    for (const r of remaining) console.log(`  🔴 [${r.name}] ${r.message}`);
    for (const v of remainingEnv) {
      if (!remaining.some((r) => r.message.includes(v))) {
        console.log(`  🔴 ${v} still missing from .env.local`);
      }
    }
    console.log(`\nWhen resolved, run:\n  ${chalk.cyan(after.startCommand)}\n`);
  }
}
