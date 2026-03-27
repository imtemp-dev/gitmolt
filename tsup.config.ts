import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  outDir: "dist",
  target: "node18",
  banner: { js: "#!/usr/bin/env node" },
  external: ["@modelcontextprotocol/sdk"],
  clean: true,
});
