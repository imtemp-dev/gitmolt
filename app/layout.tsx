import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 antialiased">{children}</body>
    </html>
  );
}
