import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flashlight Ratings",
  description: "Rankings, comparisons, and detailed flashlight specs."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              FLASHLIGHT RATINGS
            </Link>
            <nav className="nav">
              <Link href="/flashlights">Catalog</Link>
              <Link href="/rankings">Rankings</Link>
              <Link href="/compare">Compare</Link>
            </nav>
          </div>
        </header>
        <main className="main container">{children}</main>
      </body>
    </html>
  );
}
