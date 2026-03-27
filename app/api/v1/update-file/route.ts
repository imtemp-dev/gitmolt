import { getInstallationOctokit } from "@/lib/github-app";
import { apiOk, apiError, parseBody, requireFields } from "@/lib/api-utils";

interface UpdateFileRequest {
  owner: string;
  repo: string;
  path: string;
  content: string;
  branch: string;
  message: string;
  sha?: string;
}

export async function POST(request: Request) {
  const body = await parseBody<UpdateFileRequest>(request);
  if (!body) return apiError(400, "Invalid JSON");

  const err = requireFields(body, ["owner", "repo", "path", "content", "branch", "message"]);
  if (err) return apiError(400, err);

  const { owner, repo, path, content, branch, message } = body;

  try {
    const octokit = await getInstallationOctokit(owner, repo);

    // Get current sha if not provided (needed for updates)
    let sha = body.sha;
    if (!sha) {
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner, repo, path, ref: branch,
        });
        if (!Array.isArray(data) && "sha" in data) {
          sha = data.sha;
        }
      } catch {
        // File doesn't exist yet — will create new
      }
    }

    const { data } = await octokit.rest.repos.createOrUpdateFileContents({
      owner, repo, path, branch, message,
      content: Buffer.from(content).toString("base64"),
      ...(sha ? { sha } : {}),
    });

    return apiOk({
      commit_sha: data.commit.sha,
      message: `Updated ${path} on ${branch}`,
    });
  } catch (e: any) {
    if (e.status === 409) return apiError(409, "File was modified concurrently. Fetch latest sha and retry.");
    if (e.status === 422) return apiError(422, e.message ?? "Validation error");
    if (e.message?.includes("not installed")) return apiError(400, e.message);
    return apiError(500, e.message ?? "Failed to update file");
  }
}
