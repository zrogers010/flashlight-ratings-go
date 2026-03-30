export default function CompareLoading() {
  return (
    <section className="grid">
      <div className="panel hero" style={{ textAlign: "center" }}>
        <div className="skeleton-line" style={{ width: 140, margin: "0 auto 8px" }} />
        <div className="skeleton-line" style={{ width: 260, height: 28, margin: "0 auto 8px" }} />
        <div className="skeleton-line" style={{ width: 400, margin: "0 auto" }} />
      </div>
      <div className="panel panel-flush">
        <div className="skeleton-block" style={{ height: 500, borderRadius: "var(--radius-lg)" }} />
      </div>
    </section>
  );
}
