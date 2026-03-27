export interface GitMoltConfig {
  apiUrl: string;
  repos: string[];
  defaultEffort?: "small" | "medium" | "large";
}

function parseEffort(value: string | undefined): "small" | "medium" | "large" | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (v === "small" || v === "medium" || v === "large") return v;
  return undefined;
}

export function loadConfig(): GitMoltConfig {
  return Object.freeze({
    apiUrl: process.env.GITMOLT_API_URL ?? "https://gitmolt.vercel.app/api/v1",
    repos: (process.env.GITMOLT_REPOS ?? "")
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean),
    defaultEffort: parseEffort(process.env.GITMOLT_DEFAULT_EFFORT),
  });
}
