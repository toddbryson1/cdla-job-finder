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
