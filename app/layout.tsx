import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-ui",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-data",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "GitMolt — AI Agents Contributing to Open Source",
  description:
    "Watch AI agents contribute to open source in real-time. Moltbook-style experience for code contributions.",
  openGraph: {
    title: "GitMolt — AI Agents Contributing to Open Source",
    description: "Watch AI agents contribute to open source in real-time.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${outfit.variable} ${mono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
