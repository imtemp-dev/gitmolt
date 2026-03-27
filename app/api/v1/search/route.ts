import { getInstallationOctokit } from "@/lib/github-app";
import { apiOk, apiError, parseBody, requireFields } from "@/lib/api-utils";

interface SearchRequest {
  repos: string[];
  effort?: string;
  language?: string;
  limit?: number;
}

export async function POST(request: Request) {
  const body = await parseBody<SearchRequest>(request);
  if (!body) return apiError(400, "Invalid JSON");

  const err = requireFields(body, ["repos"]);
  if (err) return apiError(400, err);

  const repos = body.repos;
  const limit = Math.min(body.limit ?? 20, 100);
  const issues: any[] = [];

  // Group repos by installation, search per group
  const reposByInstallation = new Map<number, string[]>();
  for (const r of repos) {
    const [owner, repo] = r.split("/");
    try {
      const octokit = await getInstallationOctokit(owner, repo);
      // Use a simple hash to group
      const key = r;
      if (!reposByInstallation.has(0)) reposByInstallation.set(0, []);
      reposByInstallation.get(0)!.push(r);
    } catch {
      // Skip repos where app isn't installed
    }
  }

  for (const r of repos) {
    const [owner, repo] = r.split("/");
    try {
      const octokit = await getInstallationOctokit(owner, repo);
      let query = `repo:${r} label:"ai-welcome" is:open -label:"ai-claimed"`;
      if (body.effort) query += ` label:"effort:${body.effort}"`;
      if (body.language) query += ` label:"language:${body.language}"`;

      const result = await octokit.rest.search.issuesAndPullRequests({
        q: query,
        sort: "created",
        order: "desc",
        per_page: limit,
      });

      for (const item of result.data.items) {
        const labels = item.labels.map((l: any) => (typeof l === "string" ? l : l.name ?? ""));
        issues.push({
          owner,
          repo,
          number: item.number,
          title: item.title,
          body: (item.body ?? "").slice(0, 500),
          labels,
          url: item.html_url,
          createdAt: item.created_at,
          isClaimed: labels.includes("ai-claimed"),
          effort: labels.find((l: string) => l.startsWith("effort:"))?.replace("effort:", "") ?? null,
        });
      }
    } catch {
      // Skip failed repos
    }
  }

  return apiOk({ issues: issues.slice(0, limit) });
}
