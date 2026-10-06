# EnvMedic Hackathon Demo (under 2 minutes)

Story: *“It works on my machine.”* A teammate hands you a project. It fails
in 5 ways. EnvMedic finds all 5, fixes the safe ones, and gets you running.

## Setup (30s, before the audience watches)

```powershell
Copy-Item -Recurse demo/broken-app $env:TEMP/envmedic-demo
cd $env:TEMP/envmedic-demo
```

Terminal B (the “someone stole port 3000” blocker):

```powershell
node -e "require('http').createServer((q,r)=>r.end('busy')).listen(3000)"
```

Set an alias so commands are short (PowerShell):

```powershell
$em = "npx tsx C:\Users\owner\OneDrive\Desktop\Project-s\EnvMedic\src\cli.ts"
```

> Use the real path to your envmedic checkout.

## Act 1 — Broken (30s)

```powershell
& $em doctor
```

Point at the 5 red lines:

1. 🔴 `GEMINI_API_KEY` missing
2. 🔴 Node version mismatch (project wants 18.x)
3. 🔴 `node_modules` missing (`chalk` cannot be resolved)
4. 🟡 `.env.example` incomplete
5. 🔴 Port 3000 occupied (shows process + free alternatives)

Health score lands low (~30s). *“Five problems, one command found them all.”*

## Act 2 — Fix (30s)

```powershell
& $em fix
```

Narrate the safety story while it runs:

- ✅ `npm install` (project-local, safe)
- ✅ `.env.example` regenerated — **names only, no secrets**
- ✅ `.env.local` template created — existing files never overwritten
- Secret *values* (`GEMINI_API_KEY`) and the port conflict are **left to the
  human**, with exact commands printed.

## Act 3 — Bootstrap (30s)

Stop the port-3000 blocker (Ctrl+C in terminal B), then:

```powershell
& $em bootstrap
```

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        PROJECT READY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Run:
  npm run dev
```

```powershell
npm run dev
# → broken-app listening on http://localhost:3000
```

Done: **broken project → doctor → fix → bootstrap → running.**

## One-liners for Q&A

- *“Does it upload my .env?”* — No. Values are never even read; try
  `doctor --json` and grep for a secret. It's not there.
- *“What about pnpm / yarn?”* — Lockfile detection, same flow.
- *“Python/Docker?”* — Out of v0.1 scope; `checks/` is shaped for plugins.
