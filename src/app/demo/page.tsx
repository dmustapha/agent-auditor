import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AgentAuditor Demo",
  description: "Demo video for AgentAuditor — real-time trust scoring for onchain AI agents",
};

export default function DemoPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f11",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Space Mono', monospace",
        color: "#f2f0eb",
        padding: "2rem",
      }}
    >
      <h1
        style={{
          fontFamily: "'VT323', monospace",
          fontSize: "3rem",
          color: "#a78bfa",
          marginBottom: "1rem",
        }}
      >
        AgentAuditor
      </h1>
      <p style={{ fontSize: "1.25rem", color: "#a8a29e", marginBottom: "2rem" }}>
        Demo video coming soon.
      </p>
      <a
        href="/"
        style={{
          color: "#a78bfa",
          textDecoration: "none",
          border: "1px solid #a78bfa",
          padding: "0.75rem 1.5rem",
          borderRadius: "8px",
        }}
      >
        Try the live app
      </a>
    </div>
  );
}
