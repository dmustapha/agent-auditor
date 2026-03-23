import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'AgentAuditor: Trust Scores for AI Agents';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#0f0f11', color: '#f2f0eb', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 16 }}>AgentAuditor</div>
        <div style={{ fontSize: 24, color: '#9070d4', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Forensic Trust Analysis</div>
        <div style={{ fontSize: 20, color: '#a8a29e', marginTop: 24 }}>Real-time onchain trust scoring for AI agents across EVM chains</div>
      </div>
    ),
    { ...size }
  );
}
