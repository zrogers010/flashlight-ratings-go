import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const metadata: Metadata = {
  title: "Flashlight Buying Guides — Learn Before You Buy",
  description:
    "Expert guides on flashlight technology, scoring methodology, battery types, beam patterns, and more. Everything you need to make an informed purchase."
};

const guides = [
  {
    slug: "how-we-score",
    title: "How We Score Flashlights",
    excerpt: "A transparent breakdown of our 5-dimension scoring algorithm — what we measure, how we weight it, and why.",
    category: "Methodology"
  },
  {
    slug: "throw-vs-flood",
    title: "Throw vs Flood Explained",
    excerpt: "Understanding the difference between candela (throw) and lumens (flood), and which matters more for your use case.",
    category: "Fundamentals"
  },
  {
    slug: "battery-guide",
    title: "Flashlight Battery Guide: 18650 vs 21700 vs CR123A",
    excerpt: "Comparing the most common flashlight batteries — capacity, size, availability, and which lights use them.",
    category: "Hardware"
  },
  {
    slug: "runtime-explained",
    title: "Runtime Numbers Explained",
    excerpt: "Why manufacturer runtime claims can be misleading, how step-down works, and how to read our runtime tables.",
    category: "Specs"
  },
  {
    slug: "ip-ratings",
    title: "Understanding IP Ratings for Flashlights",
    excerpt: "What IPX4, IPX8, and IP68 actually mean in practice, and how much waterproofing you really need.",
    category: "Durability"
  },
  {
    slug: "best-edc-weight",
    title: "Best Weight Range for EDC Flashlights",
    excerpt: "Why 60-110g is the sweet spot for pocket carry, and how body shape and clip quality factor in.",
    category: "EDC"
  }
];

export default function GuidesPage() {
  return (
    <section className="grid">
      <Breadcrumbs items={[{ label: "Guides" }]} />

      <div className="panel hero">
        <p className="kicker">Buying Guides</p>
        <h1>Learn Before You Buy</h1>
        <p className="muted" style={{ maxWidth: 560 }}>
          In-depth guides on flashlight technology, specs, and scoring methodology.
          Make an informed decision backed by data.
        </p>
      </div>

      <div className="guide-grid">
        {guides.map((guide) => (
          <article key={guide.slug} className="guide-card">
            <span className="badge badge-teal" style={{ marginBottom: 8 }}>{guide.category}</span>
            <h3>{guide.title}</h3>
            <p className="muted" style={{ fontSize: "0.9rem", marginBottom: 12 }}>{guide.excerpt}</p>
            <Link href={`/guides/${guide.slug}`} className="btn btn-ghost btn-sm">
              Read Guide →
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
