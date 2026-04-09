import Link from "next/link";

export default function NotFound() {
  return (
    <section className="grid">
      <div className="panel hero" style={{ textAlign: "center" }}>
        <p className="kicker">404</p>
        <h1>Page Not Found</h1>
        <p className="muted" style={{ maxWidth: 480, margin: "0 auto 24px" }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          Try one of these instead:
        </p>
        <div className="spec-row" style={{ justifyContent: "center", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
          <Link href="/best-flashlights/tactical" className="chip">Tactical</Link>
          <Link href="/best-flashlights/edc" className="chip">EDC</Link>
          <Link href="/best-flashlights/camping" className="chip">Camping</Link>
          <Link href="/best-flashlights/value" className="chip">Best Value</Link>
          <Link href="/best-flashlights/throw" className="chip">Max Throw</Link>
          <Link href="/best-flashlights/survival" className="chip">Survival</Link>
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/" className="button-link">Home</Link>
          <Link href="/flashlights" className="button-link button-secondary">Browse All</Link>
          <Link href="/find-yours" className="button-link button-secondary">Find Yours</Link>
        </div>
      </div>
    </section>
  );
}
