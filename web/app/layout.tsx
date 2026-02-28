import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { MobileNav } from "@/components/MobileNav";
import "./globals.css";

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

export const metadata: Metadata = {
  title: {
    default: "FlashlightRatings — Data-Driven Flashlight Rankings & Reviews",
    template: "%s | FlashlightRatings"
  },
  description:
    "Find the best flashlight for any use case. Expert rankings across tactical, EDC, camping, and more — powered by verified specs, scoring algorithms, and real-time Amazon pricing.",
  keywords: [
    "best flashlights",
    "flashlight rankings",
    "flashlight reviews",
    "tactical flashlight",
    "EDC flashlight",
    "flashlight comparison"
  ],
  openGraph: {
    type: "website",
    siteName: "FlashlightRatings",
    title: "FlashlightRatings — Data-Driven Flashlight Rankings & Reviews",
    description:
      "Find the best flashlight for any use case. Expert rankings across tactical, EDC, camping, and more."
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
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
