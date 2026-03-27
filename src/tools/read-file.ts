import type { GitMoltAPIClient } from "../github/client.js";
import type { ToolResponse } from "../types.js";
import { ok, err } from "../types.js";

export async function handleReadFile(
  args: Record<string, unknown>,
  client: GitMoltAPIClient
): Promise<ToolResponse> {
  const owner = args.owner as string;
  const repo = args.repo as string;
  const path = args.path as string;
  const branch = args.branch as string | undefined;

  if (!owner || !repo || !path) {
    return err("Required: owner, repo, path");
  }

  try {
    const result = await client.readFile(owner, repo, path, branch);
    return ok(
      `File: ${path} (${result.size} bytes, sha: ${result.sha.slice(0, 8)})\n\n${result.content}`
    );
  } catch (e) {
    return err((e as Error).message);
  }
}
