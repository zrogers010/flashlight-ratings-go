import type { FlashlightItem } from "@/lib/api";

function fmt(v?: number, digits = 0) {
  if (v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

type Props = {
  item: FlashlightItem;
};

export function QuickSpecTooltip({ item }: Props) {
  const specs = [
    item.max_candela != null && { label: "Candela", value: fmt(item.max_candela) },
    item.weight_g != null && { label: "Weight", value: `${fmt(item.weight_g)}g` },
    item.led_model && { label: "LED", value: item.led_model },
    item.switch_type && { label: "Switch", value: item.switch_type },
  ].filter(Boolean) as { label: string; value: string }[];

  if (specs.length === 0) return null;

  return (
    <div className="quick-spec-tooltip" aria-hidden>
      {specs.map((s) => (
        <div key={s.label} className="quick-spec-row">
          <span className="quick-spec-label">{s.label}</span>
          <span className="quick-spec-value">{s.value}</span>
        </div>
      ))}
    </div>
  );
}
