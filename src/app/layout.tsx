import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentAuditor — Trust Scores for AI Agents",
  description: "Autonomous trust evaluation for AI agents across EVM chains",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-surface text-text-primary min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
