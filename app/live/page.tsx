import { createServerClient } from "@/lib/supabase/server";
import { LiveFeed } from "@/components/LiveFeed";
import { Header } from "@/components/Header";
import type { GitMoltEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="min-h-screen bg-gray-950">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-400">
            Failed to load events. Live updates may still work.
          </div>
        )}
        <LiveFeed initialEvents={(data ?? []) as GitMoltEvent[]} />
      </main>
    </div>
  );
}
