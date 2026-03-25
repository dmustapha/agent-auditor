import type { Metadata } from "next";
import { Inter, VT323, Space_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const vt323 = VT323({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-vt323",
});

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://agent-auditor.vercel.app"
  ),
  title: "AgentAuditor: Trust Scores for AI Agents",
  description: "Autonomous trust evaluation for AI agents across EVM chains",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "AgentAuditor: Trust Scores for AI Agents",
    description: "Real-time onchain trust scoring for AI agents across EVM chains.",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "AgentAuditor" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentAuditor: Trust Scores for AI Agents",
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
    <html lang="en" className={`${inter.variable} ${vt323.variable} ${spaceMono.variable}`}>
      <body className="bg-surface text-text-primary min-h-dvh antialiased">
        {children}
      </body>
    </html>
  );
}
