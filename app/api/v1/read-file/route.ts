import { getInstallationOctokit } from "@/lib/github-app";
import { apiOk, apiError, parseBody, requireFields } from "@/lib/api-utils";

interface ReadFileRequest {
  owner: string;
  repo: string;
  path: string;
  branch?: string;
}

export async function POST(request: Request) {
  const body = await parseBody<ReadFileRequest>(request);
  if (!body) return apiError(400, "Invalid JSON");

  const err = requireFields(body, ["owner", "repo", "path"]);
  if (err) return apiError(400, err);

  const { owner, repo, path, branch } = body;

  try {
    const octokit = await getInstallationOctokit(owner, repo);
    const { data } = await octokit.rest.repos.getContent({
      owner, repo, path,
      ...(branch ? { ref: branch } : {}),
    });

    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
      return apiError(400, `${path} is not a file`);
    }

    const content = Buffer.from(data.content, "base64").toString("utf-8");

    return apiOk({
      content,
      sha: data.sha,
      size: data.size,
      path: data.path,
    });
  } catch (e: any) {
    if (e.status === 404) return apiError(404, `File not found: ${path}`);
    if (e.message?.includes("not installed")) return apiError(400, e.message);
    return apiError(500, e.message ?? "Failed to read file");
  }
}
