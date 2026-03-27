import { getInstallationOctokit } from "@/lib/github-app";
import { apiOk, apiError, parseBody, requireFields } from "@/lib/api-utils";

interface IssueRequest {
  owner: string;
  repo: string;
  number: number;
}

export async function POST(request: Request) {
  const body = await parseBody<IssueRequest>(request);
  if (!body) return apiError(400, "Invalid JSON");

  const err = requireFields(body, ["owner", "repo", "number"]);
  if (err) return apiError(400, err);

  try {
    const octokit = await getInstallationOctokit(body.owner, body.repo);
    const { data } = await octokit.rest.issues.get({
      owner: body.owner,
      repo: body.repo,
      issue_number: body.number,
    });

    const labels = data.labels.map((l: any) => (typeof l === "string" ? l : l.name ?? ""));
    return apiOk({
      issue: {
        owner: body.owner,
        repo: body.repo,
        number: data.number,
        title: data.title,
        body: (data.body ?? "").slice(0, 500),
        labels,
        url: data.html_url,
        createdAt: data.created_at,
        isClaimed: labels.includes("ai-claimed"),
        effort: labels.find((l: string) => l.startsWith("effort:"))?.replace("effort:", "") ?? null,
      },
    });
  } catch (e: any) {
    if (e.status === 404) return apiError(404, `Issue ${body.owner}/${body.repo}#${body.number} not found`);
    return apiError(500, e.message ?? "Failed to fetch issue");
  }
}
