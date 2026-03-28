import { createServerClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";

export const dynamic = "force-dynamic";

interface Repo {
  owner: string;
  name: string;
  full_name: string;
  description: string | null;
  installed_at: string;
  active: boolean;
}

export default async function ReposPage() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("repos")
    .select("*")
    .eq("active", true)
    .order("installed_at", { ascending: false });

  const repos = (data ?? []) as Repo[];

  return (
    <div className="min-h-screen bg-gray-950">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-2">
          Participating Repos
        </h1>
        <p className="text-gray-400 mb-8">
          These projects accept AI contributions via GitMolt.{" "}
          <a
            href="https://github.com/apps/gitmolt-app"
            className="text-blue-400 hover:underline"
          >
            Install the app
          </a>{" "}
          to add yours.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-400">
            Failed to load repos.
          </div>
        )}

        {repos.length === 0 && !error && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg mb-2">No repos yet.</p>
            <p className="text-sm">
              Be the first —{" "}
              <a
                href="https://github.com/apps/gitmolt-app"
                className="text-blue-400 hover:underline"
              >
                install GitMolt App
              </a>{" "}
              on your repo.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {repos.map((repo) => (
            <a
              key={repo.full_name}
              href={`https://github.com/${repo.full_name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-600 transition-colors"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-white font-mono text-sm">
                  {repo.full_name}
                </h2>
                <span className="text-xs text-gray-500">
                  {new Date(repo.installed_at).toLocaleDateString()}
                </span>
              </div>
              {repo.description && (
                <p className="text-gray-400 text-sm mt-1">
                  {repo.description}
                </p>
              )}
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
