// Deliberately broken demo app for EnvMedic.
// Problems baked in:
//   1. GEMINI_API_KEY is required but missing (no .env / .env.local here).
//   2. DATABASE_URL is required but missing.
//   3. engines.node pins 18.x — modern runtimes mismatch.
//   4. node_modules is absent (chalk declared but not installed).
//   5. .env.example exists but is incomplete (missing GEMINI_API_KEY).
//   6. Port 3000 is the expected dev port (occupy it to demo the conflict).
import http from "node:http";
import { loadConfig } from "./src/config.js";

const config = loadConfig();
const port = Number(process.env.PORT) || 3000;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end(`broken-app up (db=${config.hasDatabase ? "configured" : "missing"})\n`);
});

server.listen(port, () => {
  console.log(`broken-app listening on http://localhost:${port}`);
});
