import type { GitMoltAPIClient } from "../github/client.js";
import type { ToolResponse } from "../types.js";
import { ok, err } from "../types.js";

export async function handleUpdateFile(
  args: Record<string, unknown>,
  client: GitMoltAPIClient
): Promise<ToolResponse> {
  const owner = args.owner as string;
  const repo = args.repo as string;
  const path = args.path as string;
  const content = args.content as string;
  const branch = args.branch as string;
  const message = args.message as string;
  const sha = args.sha as string | undefined;

  if (!owner || !repo || !path || !content || !branch || !message) {
    return err("Required: owner, repo, path, content, branch, message");
  }

  try {
    const result = await client.updateFile({ owner, repo, path, content, branch, message, sha });
    return ok(`✅ ${result.message}\nCommit: ${result.commit_sha.slice(0, 8)}`);
  } catch (e) {
    return err((e as Error).message);
  }
}
