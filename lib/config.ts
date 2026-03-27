export interface ServerConfig {
  githubWebhookSecret: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}

export function getServerConfig(): ServerConfig {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !url || !key) {
    throw new Error(
      "Missing server config. Required: GITHUB_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return { githubWebhookSecret: secret, supabaseUrl: url, supabaseServiceRoleKey: key };
}
