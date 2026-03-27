import { getInstallationOctokit } from "@/lib/github-app";
import { apiOk, apiError, parseBody, requireFields } from "@/lib/api-utils";

interface UnclaimRequest {
  owner: string;
  repo: string;
  issue_number: number;
  reason?: string;
}

export async function POST(request: Request) {
  const body = await parseBody<UnclaimRequest>(request);
  if (!body) return apiError(400, "Invalid JSON");

  const err = requireFields(body, ["owner", "repo", "issue_number"]);
  if (err) return apiError(400, err);

  const { owner, repo, issue_number, reason } = body;

  try {
    const octokit = await getInstallationOctokit(owner, repo);

    try {
      await octokit.rest.issues.removeLabel({ owner, repo, issue_number, name: "ai-claimed" });
    } catch {}

    await octokit.rest.issues.createComment({
      owner, repo, issue_number,
      body: `🤖 Released claim. ${reason ?? "Available for others to work on."}`,
    });

    return apiOk({ message: `Released claim on ${owner}/${repo}#${issue_number}` });
  } catch (e: any) {
    return apiError(500, e.message ?? "Failed to unclaim");
  }
}
