#!/usr/bin/env node
import { Command, InvalidOptionArgumentError } from "commander";
import { runDoctor } from "./commands/doctor.js";
import { runFix } from "./commands/fix.js";
import { runBootstrap } from "./commands/bootstrap.js";
import { runSnapshot } from "./commands/snapshot.js";

const program = new Command();
const cwd = process.cwd();

program
  .name("envmedic")
  .description("Diagnose the environment. Fix the setup. Ship the project.")
  .version("0.1.0")
  .showHelpAfterError()
  .addHelpText(
    "after",
    "\nExamples:\n  $ envmedic doctor\n  $ envmedic fix\n  $ envmedic bootstrap\n  $ envmedic snapshot",
  );

program
  .command("doctor")
  .description("Scan the project and explain what may fail on this machine")
  .option("--json", "machine-readable JSON output")
  .option("--port <n>", "extra expected port (repeatable)", (v, acc: number[]) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      throw new InvalidOptionArgumentError(`Invalid port: ${v}. Use an integer 1-65535.`);
    }
    return [...acc, n];
  }, [] as number[])
  .action(async (opts: { json?: boolean; port: number[] }) => {
    await runDoctor(cwd, { json: opts.json, ports: opts.port.length > 0 ? opts.port : undefined });
  });

program
  .command("fix")
  .description("Auto-fix safe project-level issues (never touches secrets)")
  .option("--dry-run", "show what would change without changing anything")
  .action(async (opts: { dryRun?: boolean }) => {
    await runFix(cwd, opts);
  });

program
  .command("bootstrap")
  .description("One-command setup for a fresh machine: install, templates, validate")
  .action(async () => {
    await runBootstrap(cwd);
  });

program
  .command("snapshot")
  .description("Generate envmedic.json describing environment requirements")
  .option("--force", "overwrite existing envmedic.json")
  .action(async (opts: { force?: boolean }) => {
    await runSnapshot(cwd, opts);
  });

// Bare `envmedic` with no command prints full help (commands registered above).
if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

// Friendly error for typos instead of a raw commander dump.
program.on("command:*", (operands: string[]) => {
  console.error(`Unknown command: ${operands.join(" ")}\n\nRun:\n  envmedic --help`);
  process.exit(1);
});

await program.parseAsync(process.argv);
