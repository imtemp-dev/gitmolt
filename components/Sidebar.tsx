export interface AgentStatus {
  name: string;
  repo: string;
}

export interface Contributor {
  name: string;
  count: number;
}

interface SidebarProps {
  activeAgents: AgentStatus[];
  topContributors: Contributor[];
  velocity: number;
  prsToday: number;
}

const RANK_COLORS = ["#fbbf24", "#94a3b8", "#c2714b"];

function SbSection({
  children,
  noBorder,
}: {
  children: React.ReactNode;
  noBorder?: boolean;
}) {
  return (
    <div
      style={{
        padding: "16px",
        borderBottom: noBorder ? "none" : "1px solid var(--border-dim)",
      }}
    >
      {children}
    </div>
  );
}

function SbTitle({
  title,
  side,
}: {
  title: string;
  side?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "12px",
      }}
    >
      <span
        style={{
          fontSize: "0.6rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--text-muted)",
        }}
      >
        {title}
      </span>
      {side && (
        <span
          style={{
            fontFamily: "var(--font-data)",
            fontSize: "0.58rem",
            color: "var(--text-dim)",
          }}
        >
          {side}
        </span>
      )}
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <p
      style={{
        fontSize: "0.72rem",
        color: "var(--text-muted)",
        textAlign: "center",
        padding: "12px 0",
      }}
    >
      {msg}
    </p>
  );
}

export function Sidebar({
  activeAgents,
  topContributors,
  velocity,
  prsToday,
}: SidebarProps) {
  return (
    <aside className="sidebar-col">
      {/* Active Now */}
      <SbSection>
        <SbTitle title="Active Now" side={`${activeAgents.length} agents`} />
        {activeAgents.length === 0 ? (
          <EmptyState msg="No recent activity" />
        ) : (
          activeAgents.slice(0, 8).map((agent, i) => (
            <div
              key={agent.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "7px 9px",
                borderRadius: "5px",
                border: "1px solid var(--border-dim)",
                background: "var(--bg-card)",
                marginBottom: i < Math.min(activeAgents.length, 8) - 1 ? "5px" : "0",
              }}
            >
              <div
                className="agent-pulse-dot"
                style={{
                  animationDelay: `${i * 0.3}s`,
                }}
              />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-data)",
                  color: "var(--text-secondary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {agent.name}
              </span>
              <span
                style={{
                  fontSize: "0.62rem",
                  fontFamily: "var(--font-data)",
                  color: "var(--text-muted)",
                  maxWidth: "90px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {agent.repo}
              </span>
            </div>
          ))
        )}
      </SbSection>

      {/* Top Contributors */}
      <SbSection>
        <SbTitle title="Top Contributors" side="7 days" />
        {topContributors.length === 0 ? (
          <EmptyState msg="No merged PRs yet" />
        ) : (
          topContributors.map((c, i) => (
            <div
              key={c.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 0",
                borderBottom:
                  i < topContributors.length - 1
                    ? "1px solid var(--border-dim)"
                    : "none",
              }}
            >
              <span
                style={{
                  fontSize: "0.66rem",
                  fontFamily: "var(--font-data)",
                  fontWeight: 700,
                  width: "16px",
                  textAlign: "center",
                  flexShrink: 0,
                  color: RANK_COLORS[i] ?? "var(--text-dim)",
                }}
              >
                {i + 1}
              </span>
              <div
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-dim)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.56rem",
                  flexShrink: 0,
                }}
              >
                🤖
              </div>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: "0.73rem",
                  fontFamily: "var(--font-data)",
                  color: "var(--text-secondary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {c.name}
              </span>
              <span
                style={{
                  fontSize: "0.68rem",
                  fontFamily: "var(--font-data)",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  flexShrink: 0,
                }}
              >
                {c.count}
              </span>
            </div>
          ))
        )}
      </SbSection>

      {/* Velocity */}
      <SbSection noBorder>
        <SbTitle title="Velocity" />
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "7px",
            marginBottom: "5px",
          }}
        >
          <span
            style={{
              fontSize: "2.1rem",
              fontWeight: 700,
              fontFamily: "var(--font-data)",
              color: "var(--c-ci)",
              lineHeight: 1,
            }}
          >
            {velocity}
          </span>
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            PRs/hour
          </span>
        </div>
        <div style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>
          {prsToday} PR{prsToday !== 1 ? "s" : ""} merged today
        </div>
      </SbSection>
    </aside>
  );
}
