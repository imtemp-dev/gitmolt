import { readFileSync } from "node:fs";

export interface GitMoltConfig {
  appId: string;
  privateKey: string;
  installationId?: number;
  repos: string[];
  defaultEffort?: "small" | "medium" | "large";
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function readKeyFile(path: string | undefined): string | undefined {
  if (!path) return undefined;
  try {
    return readFileSync(path, "utf-8");
  } catch {
    throw new ConfigError(
      `Cannot read private key file: ${path}. Check GITMOLT_PRIVATE_KEY_PATH.`
    );
  }
}

function parseEffort(
  value: string | undefined
): "small" | "medium" | "large" | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (v === "small" || v === "medium" || v === "large") return v;
  return undefined;
}

export function loadConfig(): GitMoltConfig {
  const appId = process.env.GITMOLT_APP_ID;
  const privateKey =
    process.env.GITMOLT_PRIVATE_KEY ??
    readKeyFile(process.env.GITMOLT_PRIVATE_KEY_PATH);

  if (!appId) {
    throw new ConfigError(
      "Missing GITMOLT_APP_ID. Set this environment variable to your GitHub App's numeric ID."
    );
  }
  if (!privateKey) {
    throw new ConfigError(
      "Missing GITMOLT_PRIVATE_KEY or GITMOLT_PRIVATE_KEY_PATH. Provide the GitHub App private key."
    );
  }

  const installationIdStr = process.env.GITMOLT_INSTALLATION_ID;

  return Object.freeze({
    appId,
    privateKey,
    installationId: installationIdStr
      ? parseInt(installationIdStr, 10)
      : undefined,
    repos: (process.env.GITMOLT_REPOS ?? "")
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean),
    defaultEffort: parseEffort(process.env.GITMOLT_DEFAULT_EFFORT),
  });
}
