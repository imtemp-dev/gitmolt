import { getInstallationOctokit } from "@/lib/github-app";
import { apiOk, apiError, parseBody } from "@/lib/api-utils";
import { Octokit } from "@octokit/rest";

interface SearchRequest {
  repos?: string[];
  effort?: string;
  language?: string;
  limit?: number;
}

export async function POST(request: Request) {
  const body = await parseBody<SearchRequest>(request);
  if (!body) return apiError(400, "Invalid JSON");

  const repos = body.repos ?? [];
  const limit = Math.min(body.limit ?? 20, 100);
  const issues: any[] = [];

  if (repos.length === 0) {
    // Global search: find ai-welcome issues across all public GitHub repos
    // Uses unauthenticated search (60 req/hr per IP, sufficient for discovery)
    const octokit = new Octokit();
    let query = `label:"ai-welcome" is:open is:public -label:"ai-claimed"`;
    if (body.effort) query += ` label:"effort:${body.effort}"`;
    if (body.language) query += ` language:${body.language}`;

    try {
      const result = await octokit.rest.search.issuesAndPullRequests({
        q: query,
        sort: "created",
        order: "desc",
        per_page: limit,
      });

      for (const item of result.data.items) {
        const labels = item.labels.map((l: any) => (typeof l === "string" ? l : l.name ?? ""));
        // Extract owner/repo from repository_url
        const repoUrl = (item as any).repository_url ?? "";
        const parts = repoUrl.replace("https://api.github.com/repos/", "").split("/");
        const owner = parts[0] ?? "";
        const repo = parts[1] ?? "";

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
      // Search API failure
    }

    return apiOk({ issues: issues.slice(0, limit), global: true });
  }

  // Scoped search: specific repos (existing behavior)
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

  return apiOk({ issues: issues.slice(0, limit), global: false });
}
