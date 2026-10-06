// Central place where required env vars are referenced so
// `envmedic doctor` can discover them via static source scan.
export function loadConfig() {
  return {
    geminiKeyPresent: Boolean(process.env.GEMINI_API_KEY),
    databaseUrl: process.env.DATABASE_URL ?? "",
    hasDatabase: Boolean(process.env.DATABASE_URL),
  };
}
