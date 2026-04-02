export async function GET(): Promise<Response> {
  return Response.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? "unknown",
    deployed_at: process.env.VERCEL_DEPLOYMENT_ID ?? "unknown",
  });
}
