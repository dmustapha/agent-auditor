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
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "AgentAuditor — Trust Scores for AI Agents",
    description: "Real-time onchain trust scoring for AI agents across EVM chains.",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "AgentAuditor" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentAuditor — Trust Scores for AI Agents",
    description: "Real-time onchain trust scoring for AI agents across EVM chains.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cormorant.variable}>
      <body className="bg-surface text-text-primary min-h-dvh antialiased">
        {children}
      </body>
    </html>
  );
}
