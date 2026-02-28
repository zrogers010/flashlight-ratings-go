import { FAQStructuredData } from "./StructuredData";

type FAQItem = { q: string; a: string };

export function FAQ({ items, withSchema = true }: { items: FAQItem[]; withSchema?: boolean }) {
  if (!items.length) return null;

  return (
    <>
      {withSchema && <FAQStructuredData items={items} />}
      <div className="faq-grid">
        {items.map((item) => (
          <details key={item.q} className="faq-item">
            <summary>{item.q}</summary>
            <div className="faq-answer">{item.a}</div>
          </details>
        ))}
      </div>
    </>
  );
}
