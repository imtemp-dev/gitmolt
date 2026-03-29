import Link from "next/link";

export function Header() {
  return (
    <header className="gm-header">
      <div
        style={{
          maxWidth: "1340px",
          margin: "0 auto",
          padding: "0 20px",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        {/* Left: logo + nav */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: "1.12rem",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--text-primary)",
              }}
            >
              Git<em style={{ fontStyle: "normal", color: "var(--c-merged)" }}>Molt</em>
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "3px 8px",
                borderRadius: "999px",
                border: "1px solid rgba(34,197,94,0.22)",
                background: "rgba(34,197,94,0.06)",
              }}
            >
              <div className="live-dot-gm" />
              <span
                style={{
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  color: "var(--c-approve)",
                  letterSpacing: "0.06em",
                  fontFamily: "var(--font-data)",
                }}
              >
                LIVE
              </span>
            </div>
          </Link>

          <nav style={{ display: "flex", alignItems: "center", gap: "2px", marginLeft: "4px" }}>
            <Link href="/live" className="gm-nav-link">Feed</Link>
            <Link href="/repos" className="gm-nav-link">Repos</Link>
          </nav>
        </div>

        {/* Right: actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <a
            href="https://github.com/imtemp-dev/gitmolt"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost-gm"
          >
            GitHub
          </a>
          <a
            href="https://github.com/apps/gitmolt-app"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary-gm"
          >
            Install App
          </a>
        </div>
      </div>
    </header>
  );
}
