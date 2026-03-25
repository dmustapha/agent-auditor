export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const TTS_METHOD = 'azure-tts' as const;

// Derived from ffprobe audio durations (Azure DragonHD Andrew voice)
// +20 frame padding per scene for natural pauses between voiceovers
const SCENE_PAD = 20;
export const SCENE_DURATIONS = {
  hook: Math.ceil(8.88 * 30) + SCENE_PAD,         // 287
  problem: Math.ceil(9.792 * 30) + SCENE_PAD,     // 314
  solution: Math.ceil(7.44 * 30) + SCENE_PAD,     // 244
  multichain: Math.ceil(18.24 * 30) + SCENE_PAD,  // 568
  trustscore: Math.ceil(14.424 * 30) + SCENE_PAD, // 453
  scanner: Math.ceil(11.136 * 30) + SCENE_PAD,    // 355
  close: Math.ceil(7.68 * 30) + SCENE_PAD,        // 251
};

export const TOTAL_FRAMES = Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0);

export const COLORS = {
  bg: '#0f0f11',
  bgLight: '#1a1a1f',
  surface: '#16161a',
  surfaceRaised: '#1e1e24',
  primary: '#a78bfa',
  primaryBright: '#b89dff',
  primaryDim: '#3d2b6b',
  text: '#f2f0eb',
  textSecondary: '#a8a29e',
  textMuted: '#6b6560',
  safe: '#4ade80',
  caution: '#facc15',
  danger: '#ef4444',
  border: 'rgba(255,255,255,0.06)',
};

export const TERMINAL = {
  bg: '#0d1117',
  text: '#c9d1d9',
  green: '#3fb950',
  yellow: '#d29922',
  red: '#f85149',
  blue: '#58a6ff',
  purple: '#bc8cff',
  prompt: '#8b949e',
};

export const PROJECT = {
  name: 'AgentAuditor',
  tagline: 'Forensic trust intelligence for the autonomous economy',
  url: 'https://agent-auditor-two.vercel.app',
  github: 'https://github.com/dmustapha/agent-auditor',
};

export const HOOK_CONTENT = {
  headline: 'AgentAuditor',
  stat: '24,000+',
  statLabel: 'AI agents active onchain',
  question: 'Which ones do you trust?',
};

export const PROBLEM_CONTENT = {
  headline: 'No Reputation Layer',
  cards: [
    { label: 'Rug Pulls', icon: '!' },
    { label: 'Wash Trading', icon: '~' },
    { label: 'Suspicious Flows', icon: '>' },
  ],
};

export const SOLUTION_CONTENT = {
  headline: 'Paste. Scan. Trust.',
  address: '0x77af31De935740567Cf4fF1986D04B2c964A786a',
  chains: ['Base', 'Gnosis', 'Ethereum', 'Arbitrum', 'Optimism', 'Polygon'],
};

export const MULTICHAIN_CONTENT = {
  chains: ['Base', 'Gnosis', 'Ethereum', 'Arbitrum', 'Optimism', 'Polygon'],
  dimensions: [
    'Activity Breakdown',
    'Timezone Fingerprint',
    'Token Flows',
    'Counterparty Analysis',
    'Protocol Loyalty',
    'Gas Patterns',
    'Method Usage',
    'Value Distribution',
    'Contract Types',
  ],
};

export const TRUSTSCORE_CONTENT = {
  score: 73,
  verdict: 'SAFE' as const,
  axes: [
    { label: 'Transaction Patterns', value: 72 },
    { label: 'Contract Interactions', value: 68 },
    { label: 'Fund Flow', value: 81 },
    { label: 'Behavioral Consistency', value: 70 },
  ],
};

export const SCANNER_LINES: Array<{ text: string; color: 'text' | 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'prompt' }> = [
  { text: '$ bun run loop', color: 'prompt' },
  { text: '[scanner] Checking 6 chains...', color: 'text' },
  { text: '[erc8004] Found 3 new agents on Base', color: 'blue' },
  { text: '[olas] Found 1 new service on Gnosis', color: 'blue' },
  { text: '[audit] 0x77af...786a  Score: 73/100  SAFE', color: 'green' },
  { text: '[audit] 0x6b75...9A80  Score: 22/100  BLOCKLIST', color: 'red' },
  { text: '[telegram] Alert sent: BLOCKLIST agent detected', color: 'yellow' },
];

export const CLOSE_CONTENT = {
  name: 'AgentAuditor',
  tagline: 'Forensic trust intelligence for the autonomous economy',
  builtOn: ['Base', 'Blockscout', 'Venice AI'],
};

// Sentence-level subtitles (audio offsets account for 15-frame transition overlap)
export const SUBTITLES: Array<{ text: string; startFrame: number; endFrame: number }> = [
  // Scene 1: Hook (audio 0-267)
  { text: 'Thousands of AI agents are transacting onchain right now.', startFrame: 0, endFrame: 100 },
  { text: 'Moving real funds. Signing real contracts.', startFrame: 100, endFrame: 180 },
  { text: 'But how do you know which ones to trust?', startFrame: 180, endFrame: 267 },
  // Scene 2: Problem (audio 252-546)
  { text: 'There is no reputation layer for autonomous agents.', startFrame: 252, endFrame: 400 },
  { text: 'No way to check if an agent has a history of rug pulls, wash trading, or suspicious fund flows before you interact with it.', startFrame: 400, endFrame: 546 },
  // Scene 3: Solution (audio 531-755)
  { text: 'AgentAuditor fixes this.', startFrame: 531, endFrame: 610 },
  { text: 'Paste any agent address, pick a chain, and get a forensic trust score in seconds.', startFrame: 610, endFrame: 755 },
  // Scene 4: Multichain (audio 740-1288)
  { text: 'The system pulls transaction history from Blockscout across six EVM chains.', startFrame: 740, endFrame: 920 },
  { text: 'Base, Gnosis, Ethereum, Arbitrum, Optimism, and Polygon.', startFrame: 920, endFrame: 1060 },
  { text: 'It builds a nine dimension behavioral profile covering activity patterns, token flows, counterparty networks, and protocol loyalty.', startFrame: 1060, endFrame: 1288 },
  // Scene 5: Trust Score (audio 1273-1706)
  { text: 'Venice AI evaluates the behavioral profile and produces a trust score from zero to one hundred.', startFrame: 1273, endFrame: 1490 },
  { text: 'Broken down across four axes: transaction patterns, contract interactions, fund flow analysis, and behavioral consistency.', startFrame: 1490, endFrame: 1706 },
  // Scene 6: Scanner (audio 1691-2026)
  { text: 'The autonomous loop runs every five minutes, discovering new agents from ERC 8004 and Olas registries.', startFrame: 1691, endFrame: 1870 },
  { text: 'Auditing them automatically, and sending Telegram alerts for any flagged agents.', startFrame: 1870, endFrame: 2026 },
  // Scene 7: Close (audio 2011-2242)
  { text: 'AgentAuditor. Forensic trust intelligence for the autonomous economy.', startFrame: 2011, endFrame: 2140 },
  { text: 'Built on Base, Blockscout, and Venice AI.', startFrame: 2140, endFrame: 2242 },
];

export const AUDIO = {
  hook: 'audio/scene-1-hook.mp3',
  problem: 'audio/scene-2-problem.mp3',
  solution: 'audio/scene-3-solution.mp3',
  multichain: 'audio/scene-4-multichain.mp3',
  trustscore: 'audio/scene-5-trustscore.mp3',
  scanner: 'audio/scene-6-scanner.mp3',
  close: 'audio/scene-7-close.mp3',
};

export const ELEVENLABS_VOICE = 'onwK4e9ZLuTAKqWW03F9';
