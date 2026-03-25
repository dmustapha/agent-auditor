/**
 * ElevenLabs TTS voiceover generator for AgentAuditor demo video.
 * Usage: bun run scripts/generate-voiceover.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const CREDENTIALS_PATH = join(
  process.env.HOME ?? '~',
  '.claude/credentials/pipeline-credentials.env',
);

function loadApiKey(): string {
  const raw = readFileSync(CREDENTIALS_PATH, 'utf-8');
  const match = raw.match(/ELEVENLABS_API_KEY=(.+)/);
  if (!match) throw new Error('ELEVENLABS_API_KEY not found in credentials');
  return match[1].trim();
}

const VOICE_ID = 'onwK4e9ZLuTAKqWW03F9'; // Daniel (British male)
const MODEL_ID = 'eleven_multilingual_v2';

const SCENES: Array<{ id: string; filename: string; text: string }> = [
  {
    id: 'hook',
    filename: 'scene-1-hook.mp3',
    text: 'Thousands of AI agents are transacting onchain right now. Moving real funds. Signing real contracts. But how do you know which ones to trust?',
  },
  {
    id: 'problem',
    filename: 'scene-2-problem.mp3',
    text: 'There is no reputation layer for autonomous agents. No way to check if an agent has a history of rug pulls, wash trading, or suspicious fund flows before you interact with it.',
  },
  {
    id: 'solution',
    filename: 'scene-3-solution.mp3',
    text: 'AgentAuditor fixes this. Paste any agent address, pick a chain, and get a forensic trust score in seconds.',
  },
  {
    id: 'multichain',
    filename: 'scene-4-multichain.mp3',
    text: 'The system pulls transaction history from Blockscout across six EVM chains. Base, Gnosis, Ethereum, Arbitrum, Optimism, and Polygon. It builds a nine dimension behavioral profile covering activity patterns, token flows, counterparty networks, and protocol loyalty.',
  },
  {
    id: 'trustscore',
    filename: 'scene-5-trustscore.mp3',
    text: 'Venice AI evaluates the behavioral profile and produces a trust score from zero to one hundred. Broken down across four axes: transaction patterns, contract interactions, fund flow analysis, and behavioral consistency.',
  },
  {
    id: 'scanner',
    filename: 'scene-6-scanner.mp3',
    text: 'The autonomous loop runs every five minutes, discovering new agents from ERC 8004 and Olas registries. Auditing them automatically, and sending Telegram alerts for any flagged agents.',
  },
  {
    id: 'close',
    filename: 'scene-7-close.mp3',
    text: 'AgentAuditor. Forensic trust intelligence for the autonomous economy. Built on Base, Blockscout, and Venice AI.',
  },
];

async function generateAudio(
  apiKey: string,
  text: string,
  outputPath: string,
): Promise<void> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: {
        stability: 0.65,
        similarity_boost: 0.78,
        style: 0.15,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${body}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(outputPath, buffer);
}

function getDuration(filePath: string): number {
  const output = execSync(
    `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
  )
    .toString()
    .trim();
  return parseFloat(output);
}

async function main() {
  const apiKey = loadApiKey();
  const audioDir = join(__dirname, '..', 'public', 'audio');

  console.log('Generating ElevenLabs voiceover...\n');

  const durations: Record<string, number> = {};

  for (const scene of SCENES) {
    const outputPath = join(audioDir, scene.filename);
    console.log(`  [${scene.id}] Generating...`);
    await generateAudio(apiKey, scene.text, outputPath);

    const duration = getDuration(outputPath);
    durations[scene.id] = duration;
    console.log(`  [${scene.id}] ${duration.toFixed(2)}s -> ${scene.filename}`);
  }

  console.log('\n--- SCENE_DURATIONS for constants.ts ---');
  console.log('export const SCENE_DURATIONS = {');
  for (const scene of SCENES) {
    const d = durations[scene.id];
    const frames = Math.ceil(d * 30);
    console.log(`  ${scene.id}: Math.ceil(${d.toFixed(2)} * 30),  // ${frames}`);
  }
  console.log('};');

  const totalFrames = Object.values(durations).reduce(
    (sum, d) => sum + Math.ceil(d * 30),
    0,
  );
  console.log(`\nTotal frames: ${totalFrames} (~${(totalFrames / 30).toFixed(1)}s)`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
