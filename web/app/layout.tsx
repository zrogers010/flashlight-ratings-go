import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { MobileNav } from "@/components/MobileNav";
import "./globals.css";

const SITE_URL = process.env.SITE_URL || "https://flashlightratings.com";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap"
});

export const viewport: Viewport = {
  themeColor: "#0d1117",
  width: "device-width",
  initialScale: 1
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Best Flashlights 2026 — Data-Driven Rankings & Reviews | FlashlightRatings",
    template: "%s | FlashlightRatings"
  },
  description:
    "Compare 40+ flashlights ranked by algorithm across tactical, EDC, camping & more. Real specs, independent scoring, and live Amazon pricing. Find the perfect flashlight in minutes.",
  keywords: [
    "best flashlights 2026",
    "flashlight rankings",
    "flashlight reviews",
    "tactical flashlight",
    "EDC flashlight",
    "flashlight comparison",
    "brightest flashlight",
    "best tactical flashlight",
    "best EDC flashlight",
    "flashlight buying guide",
    "SureFire",
    "Streamlight",
    "Fenix",
    "Olight"
  ],
  alternates: {
    canonical: SITE_URL
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "FlashlightRatings",
    url: SITE_URL,
    title: "Best Flashlights 2026 — Data-Driven Rankings & Reviews",
    description:
      "Compare 40+ flashlights ranked by algorithm across tactical, EDC, camping & more. Real specs, independent scoring, and live Amazon pricing."
  },
  twitter: {
    card: "summary_large_image",
    title: "Best Flashlights 2026 — FlashlightRatings",
    description: "Data-driven flashlight rankings & reviews. Compare specs, scores, and prices."
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1
  },
  other: {
    "google-site-verification": process.env.GOOGLE_SITE_VERIFICATION || ""
  }
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "FlashlightRatings",
              url: SITE_URL,
              description: "Data-driven flashlight rankings, reviews, and buying guides.",
              potentialAction: {
                "@type": "SearchAction",
                target: `${SITE_URL}/flashlights?q={search_term_string}`,
                "query-input": "required name=search_term_string"
              }
            })
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "FlashlightRatings",
              url: SITE_URL,
              logo: `${SITE_URL}/icon.svg`
            })
          }}
        />
      </head>
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              <span className="brand-icon">◉</span>
              FLASHLIGHTRATINGS
            </Link>
            <nav className="nav" id="main-nav">
              <Link href="/best-flashlights">Best Flashlights</Link>
              <Link href="/find-yours">Find Yours</Link>
              <Link href="/compare">Compare</Link>
              <Link href="/rankings">Rankings</Link>
              <Link href="/guides">Guides</Link>
            </nav>
            <MobileNav />
          </div>
        </header>

        <main className="main container">{children}</main>

        <footer className="site-footer">
          <div className="container">
            <div className="footer-grid">
              <div>
                <p className="footer-brand">◉ FLASHLIGHTRATINGS</p>
                <p className="muted" style={{ fontSize: "0.88rem", maxWidth: 340 }}>
                  Data-driven flashlight rankings powered by verified specs,
                  algorithmic scoring, and real-time Amazon pricing.
                </p>
              </div>
              <div className="footer-section">
                <h4>Explore</h4>
                <Link href="/best-flashlights">Best Flashlights</Link>
                <Link href="/rankings">Rankings</Link>
                <Link href="/compare">Compare</Link>
                <Link href="/find-yours">Find Yours</Link>
              </div>
              <div className="footer-section">
                <h4>Categories</h4>
                <Link href="/best-flashlights/tactical">Tactical</Link>
                <Link href="/best-flashlights/edc">EDC</Link>
                <Link href="/best-flashlights/camping">Camping</Link>
                <Link href="/best-flashlights/value">Best Value</Link>
              </div>
              <div className="footer-section">
                <h4>Resources</h4>
                <Link href="/guides">Buying Guides</Link>
                <Link href="/guides/how-we-score">How We Score</Link>
                <Link href="/guides/battery-guide">Battery Guide</Link>
              </div>
            </div>
            <div className="footer-bottom">
              <p>
                As an Amazon Associate we earn from qualifying purchases. Prices
                and availability are subject to change.
              </p>
              <p>&copy; {new Date().getFullYear()} FlashlightRatings</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
