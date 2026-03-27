export type GitHubErrorKind =
  | "rate_limit"
  | "auth_failure"
  | "not_found"
  | "not_installed"
  | "conflict"
  | "validation"
  | "network"
  | "unknown";

export class GitHubError extends Error {
  kind: GitHubErrorKind;
  status?: number;
  retryAfter?: number;

  constructor(kind: GitHubErrorKind, message: string, status?: number, retryAfter?: number) {
    super(message);
    this.name = "GitHubError";
    this.kind = kind;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function classifyError(error: unknown): GitHubError {
  if (error instanceof GitHubError) return error;

  const e = error as { status?: number; response?: { headers?: Record<string, string> }; message?: string; code?: string };
  const status = e.status;
  const message = e.message ?? "Unknown error";

  if (e.code === "ECONNRESET" || e.code === "ETIMEDOUT" || e.code === "ENOTFOUND") {
    return new GitHubError("network", message);
  }

  if (status === 401) {
    return new GitHubError("auth_failure", "Authentication failed. Check GITMOLT_APP_ID and GITMOLT_PRIVATE_KEY.", status);
  }

  if (status === 403 || status === 429) {
    const retryAfter = parseInt(e.response?.headers?.["retry-after"] ?? "60", 10);
    return new GitHubError("rate_limit", `Rate limited. Retry after ${retryAfter} seconds.`, status, retryAfter);
  }

  if (status === 404) {
    return new GitHubError("not_found", message, status);
  }

  if (status === 409) {
    return new GitHubError("conflict", message, status);
  }

  if (status === 422) {
    return new GitHubError("validation", message, status);
  }

  return new GitHubError("unknown", message, status);
}

export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: GitHubError | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (raw) {
      const error = classifyError(raw);
      lastError = error;
      if (error.kind === "network" && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (error.kind === "rate_limit" && attempt < maxRetries && error.retryAfter) {
        await new Promise((r) => setTimeout(r, error.retryAfter! * 1000));
        continue;
      }
      throw error;
    }
  }
  throw lastError!;
}
