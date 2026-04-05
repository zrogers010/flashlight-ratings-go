export default function FlashlightsLoading() {
  return (
    <section className="grid">
      <div className="panel hero" style={{ textAlign: "center" }}>
        <div className="skeleton-line" style={{ width: 100, margin: "0 auto 8px" }} />
        <div className="skeleton-line" style={{ width: 200, height: 28, margin: "0 auto 8px" }} />
        <div className="skeleton-line" style={{ width: 340, margin: "0 auto" }} />
      </div>
      <div className="catalog-grid-layout">
        <aside className="spec-bar-wrap" aria-hidden>
          <div className="skeleton-block" style={{ height: 400 }} />
        </aside>
        <div className="card-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton-card" />
          ))}
        </div>
      </div>
    </section>
  );
}
