import { describe, it, expect } from "vitest";
import { classifyError, GitHubError, withRetry } from "../github/errors.js";

describe("classifyError", () => {
  it("classifies 401 as auth_failure", () => {
    const err = classifyError({ status: 401, message: "Bad credentials" });
    expect(err.kind).toBe("auth_failure");
    expect(err.status).toBe(401);
  });

  it("classifies 403 as rate_limit", () => {
    const err = classifyError({
      status: 403,
      message: "API rate limit exceeded",
      response: { headers: { "retry-after": "30" } },
    });
    expect(err.kind).toBe("rate_limit");
    expect(err.retryAfter).toBe(30);
  });

  it("classifies 429 as rate_limit", () => {
    const err = classifyError({ status: 429, message: "Too many requests" });
    expect(err.kind).toBe("rate_limit");
  });

  it("classifies 404 as not_found", () => {
    const err = classifyError({ status: 404, message: "Not found" });
    expect(err.kind).toBe("not_found");
    expect(err.status).toBe(404);
  });

  it("classifies 409 as conflict", () => {
    const err = classifyError({ status: 409, message: "Conflict" });
    expect(err.kind).toBe("conflict");
  });

  it("classifies 422 as validation", () => {
    const err = classifyError({ status: 422, message: "Validation failed" });
    expect(err.kind).toBe("validation");
  });

  it("classifies ECONNRESET as network", () => {
    const err = classifyError({ code: "ECONNRESET", message: "Connection reset" });
    expect(err.kind).toBe("network");
  });

  it("classifies ETIMEDOUT as network", () => {
    const err = classifyError({ code: "ETIMEDOUT", message: "Timed out" });
    expect(err.kind).toBe("network");
  });

  it("returns existing GitHubError unchanged", () => {
    const original = new GitHubError("auth_failure", "test", 401);
    const result = classifyError(original);
    expect(result).toBe(original);
  });

  it("classifies unknown errors", () => {
    const err = classifyError({ status: 500, message: "Server error" });
    expect(err.kind).toBe("unknown");
  });
});

describe("withRetry", () => {
  it("returns result on success", async () => {
    const result = await withRetry(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("retries network errors", async () => {
    let attempt = 0;
    const result = await withRetry(
      () => {
        attempt++;
        if (attempt < 2) throw { code: "ECONNRESET", message: "reset" };
        return Promise.resolve("ok");
      },
      3
    );
    expect(result).toBe("ok");
    expect(attempt).toBe(2);
  });

  it("throws after max retries", async () => {
    await expect(
      withRetry(
        () => {
          throw { code: "ECONNRESET", message: "reset" };
        },
        1
      )
    ).rejects.toThrow();
  });

  it("does not retry non-retryable errors", async () => {
    let attempt = 0;
    await expect(
      withRetry(
        () => {
          attempt++;
          throw { status: 404, message: "Not found" };
        },
        3
      )
    ).rejects.toThrow();
    expect(attempt).toBe(1);
  });
});
