import { describe, it, expect } from "vitest";
import { ApiError } from "../github/client.js";

describe("ApiError", () => {
  it("creates error with status and message", () => {
    const err = new ApiError(404, "Not found");
    expect(err.status).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err.name).toBe("ApiError");
  });

  it("includes optional code", () => {
    const err = new ApiError(409, "Claimed", "conflict");
    expect(err.code).toBe("conflict");
  });
});
