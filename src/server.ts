import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { GitMoltClient } from "./github/client.js";
import { TOOLS, handleToolCall } from "./tools/index.js";
import { log } from "./utils/logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new GitMoltClient(config);

  const server = new Server(
    { name: "gitmolt", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    log("info", `Tool call: ${name}`, { args });
    try {
      const result = await handleToolCall(name, args ?? {}, client);
      return result as unknown as Record<string, unknown>;
    } catch (error) {
      log("error", `Tool ${name} failed`, {
        error: (error as Error).message,
      });
      return {
        content: [
          { type: "text" as const, text: `Internal error: ${(error as Error).message}` },
        ],
        isError: true,
      } as Record<string, unknown>;
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("info", "GitMolt MCP server started", {
    repos: config.repos,
    defaultEffort: config.defaultEffort,
  });
}

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

main().catch((error) => {
  log("error", "Fatal error", { error: (error as Error).message });
  process.exit(1);
});
