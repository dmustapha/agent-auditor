import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--loaded-cormorant",
});

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
    <html lang="en" className={cormorant.variable}>
      <body className="bg-surface text-text-primary min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
