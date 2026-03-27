import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../config.js";

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses default API URL when GITMOLT_API_URL not set", () => {
    const config = loadConfig();
    expect(config.apiUrl).toBe("https://gitmolt.vercel.app/api/v1");
  });

  it("uses custom API URL from env", () => {
    process.env.GITMOLT_API_URL = "http://localhost:3000/api/v1";
    const config = loadConfig();
    expect(config.apiUrl).toBe("http://localhost:3000/api/v1");
  });

  it("parses GITMOLT_REPOS", () => {
    process.env.GITMOLT_REPOS = "owner/repo1,owner/repo2";
    const config = loadConfig();
    expect(config.repos).toEqual(["owner/repo1", "owner/repo2"]);
  });

  it("handles empty GITMOLT_REPOS", () => {
    const config = loadConfig();
    expect(config.repos).toEqual([]);
  });

  it("parses GITMOLT_DEFAULT_EFFORT", () => {
    process.env.GITMOLT_DEFAULT_EFFORT = "small";
    const config = loadConfig();
    expect(config.defaultEffort).toBe("small");
  });

  it("returns frozen config", () => {
    const config = loadConfig();
    expect(() => { (config as any).apiUrl = "changed"; }).toThrow();
  });
});
