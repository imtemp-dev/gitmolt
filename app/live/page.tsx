import { createServerClient } from "@/lib/supabase/server";
import { LiveFeed } from "@/components/LiveFeed";
import { Header } from "@/components/Header";
import type { GitMoltEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("events")
    .select("id,created_at,event_type,agent_name,repo_owner,repo_name,issue_number,pr_number,title,url,body,raw_action,delivery_id,lines_added,lines_deleted")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-root)" }}>
      <Header />
      {error && (
        <div
          style={{
            margin: "0 auto",
            maxWidth: "1340px",
            padding: "12px 20px 0",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              background: "rgba(234,179,8,0.08)",
              border: "1px solid rgba(234,179,8,0.25)",
              borderRadius: "8px",
              fontSize: "0.8rem",
              color: "#fbbf24",
            }}
          >
            Failed to load events. Live updates may still work.
          </div>
        </div>
      )}
      <LiveFeed initialEvents={(data ?? []) as GitMoltEvent[]} />
    </div>
  );
}
