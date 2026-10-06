# EnvMedic Architecture (v0.1)

```text
                    ┌──────────┐
                    │  cli.ts  │  commander: doctor / fix / bootstrap / snapshot
                    └────┬─────┘
                         ▼
┌──────────────────────────────────────────────────────┐
│                   commands/*.ts                      │
│  doctor (report)  fix (safe repairs)                 │
│  bootstrap (detect→fix→validate)  snapshot (write)   │
└────────────────────────┬─────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────┐
│               core/diagnose.ts                        │
│  runDiagnosis(cwd): reads pkg → detects PM/framework │
│  → gathers env refs + snapshot → runs all checks     │
│  → scores → builds fix list                          │
└───┬──────┬───────┬───────┬────────┬──────┬───────────┘
    ▼      ▼       ▼       ▼        ▼      ▼
┌───────┐┌────┐┌────┐┌────────┐┌────────┐┌─────┐┌───────────┐
│node   ││pkg ││deps││project ││  env   ││ports││    git    │
│.ts    ││mgr ││.ts ││  .ts   ││  .ts   ││.ts ││    .ts    │
└───────┘└────┘└────┘└────────┘└────────┘└─────┘└───────────┘
    │      shared helpers (no I/O policy, pure where possible)
    ▼
┌──────────────────────────────────────────────────────┐
│ core/: health-score.ts (CATEGORY_WEIGHTS → 0–100)     │
│   env-scan.ts (process.env.* discovery, names only)  │
│   project.ts (PM/framework/scripts/start command)    │
│   semver.ts (tiny ^ ~ >= range check)                │
│   snapshot.ts (envmedic.json zod schema + read/write)│
└──────────────────────────────────────────────────────┘
```

## Data flow

`runDiagnosis()` returns a single `Diagnosis` object:

```text
{ project, results: CheckResult[], fixes: RecommendedFix[],
  score, envRequired, envMissing, ports, startCommand }
```

- `doctor` renders it (human or `--json`).
- `fix` acts on the safe subset (install, `.env.example`, `.env.local` template).
- `bootstrap` = diagnose → fix → re-diagnose → start hint.
- `snapshot` writes the *expected* environment to `envmedic.json`, which the
  next `diagnose()` run reads back (ports + env requirements).

## Key invariants

1. **Names only, never values.** `env-scan.ts` returns variable *names*;
   nothing in the codebase reads or prints secret values.
2. **No destructive defaults.** `fix` only creates missing files and installs
   project-local dependencies. It never overwrites `.env*`, never kills
   processes, never touches system config.
3. **Checks are additive.** Each file in `checks/` exports functions returning
   `CheckResult[]` with a `category`. Adding `python.ts` later means: new
   check file + a weight entry — `diagnose()` picks it up.
4. **Scores are weights, not counts.** `CATEGORY_WEIGHTS` sums to 100; a
   category with zero checks scores full marks so missing plugins don't
   penalize.

## `envmedic.json` (snapshot contract)

```json
{
  "runtime": { "node": "22.x", "packageManager": "npm" },
  "commands": { "dev": "npm run dev", "build": "npm run build" },
  "ports": [3000],
  "env": ["GEMINI_API_KEY", "DATABASE_URL"]
}
```
