import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claude Code Mastery — Personal Assessment",
  description:
    "Comparison of your Claude Code usage against Boris Cherny's 87 tips and the Claude Code Mastery assessment rubric.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
