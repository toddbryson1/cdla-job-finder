import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "CDLA.jobs — Class A driver matching",
    template: "%s | CDLA.jobs",
  },
  description:
    "CDLA.jobs matches Class A CDL drivers with carriers actually hiring. One intake, real matches, no spam.",
  // Google Search Console property verification. Set
  // GOOGLE_SITE_VERIFICATION in env to the value Google gives you on
  // Search Console → "HTML tag" verification method (the content="..."
  // attribute, not the full meta tag). Required before Google indexes
  // any of our JobPosting structured data — Search Console is also
  // where you submit /sitemap.xml.
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-brand-ink">
        {children}
      </body>
    </html>
  );
}
