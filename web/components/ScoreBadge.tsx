export function ScoreBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const tier = score >= 80 ? "high" : score >= 60 ? "mid" : "low";
  const dims = size === "sm" ? 38 : size === "lg" ? 64 : 52;

  return (
    <span
      className={`score-badge ${tier}`}
      style={{ width: dims, height: dims, fontSize: size === "sm" ? "0.78rem" : size === "lg" ? "1.1rem" : "0.95rem" }}
      title={`Score: ${score.toFixed(1)}`}
    >
      {score.toFixed(0)}
    </span>
  );
}
