import detectPort from "detect-port";
import { execa } from "execa";
import type { CheckResult } from "../core/health-score.js";
import {
  portWorkaroundCommand,
  type PackageManager,
} from "../core/project.js";

export interface PortInfo {
  port: number;
  occupied: boolean;
  processName?: string | undefined;
  pid?: number | undefined;
  alternatives: number[];
}

async function findProcessOnPort(port: number): Promise<{ processName?: string | undefined; pid?: number | undefined }> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execa("netstat", ["-ano"]);
      const lines = stdout.split("\n").filter((l) => new RegExp(`[.:]${port}\\s`).test(l));
      const m = lines[0]?.match(/(\d+)\s*$/);
      const pid = m?.[1] ? Number(m[1]) : undefined;
      if (!pid) return {};
      try {
        const { stdout: tasks } = await execa("tasklist", [
          "/FI",
          `PID eq ${pid}`,
          "/FO",
          "CSV",
          "/NH",
        ]);
        const name = tasks.split(",")[0]?.replace(/"/g, "").trim();
        return { processName: name || undefined, pid };
      } catch {
        return { pid };
      }
    } else {
      const { stdout } = await execa("lsof", ["-i", `:${port}`, "-sTCP:LISTEN", "-t"]);
      const pid = Number(stdout.split("\n")[0]);
      if (!pid) return {};
      try {
        const { stdout: name } = await execa("ps", ["-p", String(pid), "-o", "comm="]);
        return { processName: name.trim() || undefined, pid };
      } catch {
        return { pid };
      }
    }
  } catch {
    return {};
  }
}

async function freeAlternatives(port: number, count = 3): Promise<number[]> {
  const out: number[] = [];
  let candidate = port + 1;
  while (out.length < count && candidate < port + 50) {
    try {
      const free = await detectPort(candidate);
      if (free === candidate) out.push(candidate);
      candidate = free === candidate ? candidate + 1 : free;
    } catch {
      candidate++;
    }
  }
  return out;
}

export async function checkPorts(
  ports: number[],
  ctx?: { scripts?: Record<string, string> | undefined; pm?: PackageManager | undefined },
): Promise<{ results: CheckResult[]; infos: PortInfo[] }> {
  const results: CheckResult[] = [];
  const infos: PortInfo[] = [];

  for (const port of ports) {
    let available: number;
    try {
      available = await detectPort(port);
    } catch (err) {
      results.push({
        name: `Port ${port}`,
        category: "ports",
        status: "fail",
        message: `Could not check port ${port}: ${(err as Error).message}`,
      });
      infos.push({ port, occupied: false, alternatives: [] });
      continue;
    }

    if (available === port) {
      results.push({
        name: `Port ${port}`,
        category: "ports",
        status: "ok",
        message: `Port ${port} is free`,
      });
      infos.push({ port, occupied: false, alternatives: [] });
    } else {
      const proc = await findProcessOnPort(port);
      const alternatives = await freeAlternatives(port);
      const who = proc.processName
        ? `${proc.processName}${proc.pid ? ` (PID ${proc.pid})` : ""}`
        : proc.pid
          ? `PID ${proc.pid}`
          : "unknown process";
      results.push({
        name: `Port ${port}`,
        category: "ports",
        status: "fail",
        message: `Port ${port} is occupied (${who})`,
        detail:
          `Available ports: ${alternatives.join(", ") || "none nearby"}\n` +
          `Run \`envmedic fix\` to pick one, or free it manually.`,
        fix: alternatives[0]
          ? portWorkaroundCommand(alternatives[0], ctx?.scripts, ctx?.pm ?? "npm")
          : undefined,
      });
      infos.push({ port, occupied: true, ...proc, alternatives });
    }
  }

  return { results, infos };
}
