import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";

const installationCache = new Map<string, number>();
const octokitCache = new Map<number, Octokit>();

function getAppOctokit(): Octokit {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) {
    throw new Error("Missing GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY");
  }
  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey },
  });
}

export async function getInstallationOctokit(owner: string, repo: string): Promise<Octokit> {
  const key = `${owner}/${repo}`;
  let installationId = installationCache.get(key);

  if (!installationId) {
    const app = getAppOctokit();
    try {
      const resp = await app.rest.apps.getRepoInstallation({ owner, repo });
      installationId = resp.data.id;
    } catch {
      throw new Error(`GitMolt App is not installed on ${owner}/${repo}`);
    }
    installationCache.set(key, installationId);
  }

  if (!octokitCache.has(installationId)) {
    const appId = process.env.GITHUB_APP_ID!;
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY!;
    octokitCache.set(
      installationId,
      new Octokit({
        authStrategy: createAppAuth,
        auth: { appId, privateKey, installationId },
      })
    );
  }

  return octokitCache.get(installationId)!;
}
