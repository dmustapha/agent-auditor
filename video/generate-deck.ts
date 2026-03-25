import PptxGenJS from "pptxgenjs";

const COLORS = {
  bg: "0f0f11",
  bgLight: "1a1a1f",
  primary: "a78bfa",
  text: "f2f0eb",
  textMuted: "a8a29e",
  safe: "4ade80",
  danger: "ef4444",
  bgCard: "1e1e24",
};

const FONT_TITLE = "Arial";
const FONT_BODY = "Arial";

function addSlideNumber(slide: PptxGenJS.Slide, num: number, total: number) {
  slide.addText(`${num}/${total}`, {
    x: 9.1,
    y: 7.0,
    w: 0.8,
    h: 0.3,
    fontSize: 10,
    color: COLORS.textMuted,
    fontFace: FONT_BODY,
    align: "right",
  });
}

async function generateDeck() {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  pptx.author = "Dami Mustapha";
  pptx.title = "AgentAuditor - Forensic Trust Scoring for Onchain AI Agents";

  const TOTAL_SLIDES = 8;
  let slideNum = 0;

  // --- Slide 1: Cover ---
  slideNum++;
  const cover = pptx.addSlide();
  cover.background = { color: COLORS.bg };
  cover.addText("AgentAuditor", {
    x: 1.5,
    y: 2.0,
    w: 10,
    h: 1.5,
    fontSize: 54,
    bold: true,
    color: COLORS.primary,
    fontFace: FONT_TITLE,
  });
  cover.addText("Forensic trust intelligence for the autonomous economy", {
    x: 1.5,
    y: 3.5,
    w: 10,
    h: 0.8,
    fontSize: 24,
    color: COLORS.text,
    fontFace: FONT_BODY,
  });
  cover.addText("SYNTHESIS 2026  |  agent-auditor-two.vercel.app", {
    x: 1.5,
    y: 4.8,
    w: 10,
    h: 0.5,
    fontSize: 16,
    color: COLORS.textMuted,
    fontFace: FONT_BODY,
  });

  // --- Slide 2: Problem ---
  slideNum++;
  const problem = pptx.addSlide();
  problem.background = { color: COLORS.bg };
  problem.addText("The Problem", {
    x: 1.0,
    y: 0.5,
    w: 11,
    h: 0.8,
    fontSize: 36,
    bold: true,
    color: COLORS.primary,
    fontFace: FONT_TITLE,
  });
  const problemPoints = [
    "Thousands of AI agents transact onchain with real funds today",
    "No reputation system exists for autonomous agents",
    "Agents can rug pull, wash trade, or drain funds with zero accountability",
    "Users, protocols, and DAOs have no way to assess agent trustworthiness before interacting",
  ];
  problemPoints.forEach((point, i) => {
    problem.addText(`\u2022  ${point}`, {
      x: 1.2,
      y: 1.8 + i * 1.0,
      w: 10.5,
      h: 0.8,
      fontSize: 20,
      color: COLORS.text,
      fontFace: FONT_BODY,
    });
  });
  addSlideNumber(problem, slideNum, TOTAL_SLIDES);

  // --- Slide 3: Solution ---
  slideNum++;
  const solution = pptx.addSlide();
  solution.background = { color: COLORS.bg };
  solution.addText("The Solution", {
    x: 1.0,
    y: 0.5,
    w: 11,
    h: 0.8,
    fontSize: 36,
    bold: true,
    color: COLORS.primary,
    fontFace: FONT_TITLE,
  });
  solution.addText(
    "AgentAuditor scans Blockscout transaction history, runs 9-dimension behavioral analysis, and publishes on-chain trust attestations via Venice AI.",
    {
      x: 1.2,
      y: 1.8,
      w: 10.5,
      h: 1.2,
      fontSize: 19,
      color: COLORS.text,
      fontFace: FONT_BODY,
    }
  );
  const features = [
    ["Multi-chain scanning", "6 EVM chains (Base, Gnosis, Ethereum, Arbitrum, Optimism, Polygon)"],
    ["Smart input detection", "Addresses, ERC-8004 Agent IDs, registry names, ENS"],
    ["9-dimension profiling", "Activity, timezone, tokens, counterparties, protocol loyalty, gas, methods, value flow, contract types"],
    ["Trust score 0-100", "4-axis breakdown: transaction patterns, contract interactions, fund flow, behavioral consistency"],
    ["Autonomous scanner", "Discovers and audits new agents every 5 minutes with Telegram alerts"],
  ];
  features.forEach(([title, desc], i) => {
    solution.addText(title, {
      x: 1.2,
      y: 3.3 + i * 0.75,
      w: 3.5,
      h: 0.6,
      fontSize: 16,
      bold: true,
      color: COLORS.primary,
      fontFace: FONT_BODY,
    });
    solution.addText(desc, {
      x: 4.8,
      y: 3.3 + i * 0.75,
      w: 7.5,
      h: 0.6,
      fontSize: 15,
      color: COLORS.textMuted,
      fontFace: FONT_BODY,
    });
  });
  addSlideNumber(solution, slideNum, TOTAL_SLIDES);

  // --- Slide 4: How It Works ---
  slideNum++;
  const howItWorks = pptx.addSlide();
  howItWorks.background = { color: COLORS.bg };
  howItWorks.addText("How It Works", {
    x: 1.0,
    y: 0.5,
    w: 11,
    h: 0.8,
    fontSize: 36,
    bold: true,
    color: COLORS.primary,
    fontFace: FONT_TITLE,
  });
  const steps = [
    { num: "1", title: "Input", desc: "User pastes agent address, Agent ID, or name. Selects chain." },
    { num: "2", title: "Fetch", desc: "Blockscout API pulls transaction history. ERC-8004 and Olas registries resolve identity." },
    { num: "3", title: "Analyze", desc: "Behavioral Profile Engine runs 9-dimension analysis on transaction data." },
    { num: "4", title: "Score", desc: "Venice AI (llama-3.3-70b) evaluates profile and produces trust score with 4-axis breakdown." },
    { num: "5", title: "Attest", desc: "Result published as on-chain attestation via ERC-7506. Non-SAFE agents trigger Telegram alert." },
  ];
  steps.forEach((step, i) => {
    howItWorks.addShape(pptx.ShapeType.roundRect, {
      x: 1.2,
      y: 1.6 + i * 1.05,
      w: 0.6,
      h: 0.6,
      fill: { color: COLORS.primary },
      rectRadius: 0.1,
    });
    howItWorks.addText(step.num, {
      x: 1.2,
      y: 1.6 + i * 1.05,
      w: 0.6,
      h: 0.6,
      fontSize: 20,
      bold: true,
      color: COLORS.bg,
      fontFace: FONT_BODY,
      align: "center",
      valign: "middle",
    });
    howItWorks.addText(step.title, {
      x: 2.1,
      y: 1.55 + i * 1.05,
      w: 2.0,
      h: 0.4,
      fontSize: 18,
      bold: true,
      color: COLORS.text,
      fontFace: FONT_BODY,
    });
    howItWorks.addText(step.desc, {
      x: 2.1,
      y: 1.9 + i * 1.05,
      w: 9.0,
      h: 0.4,
      fontSize: 14,
      color: COLORS.textMuted,
      fontFace: FONT_BODY,
    });
  });
  addSlideNumber(howItWorks, slideNum, TOTAL_SLIDES);

  // --- Slide 5: Tech Stack ---
  slideNum++;
  const techStack = pptx.addSlide();
  techStack.background = { color: COLORS.bg };
  techStack.addText("Tech Stack", {
    x: 1.0,
    y: 0.5,
    w: 11,
    h: 0.8,
    fontSize: 36,
    bold: true,
    color: COLORS.primary,
    fontFace: FONT_TITLE,
  });
  const stack = [
    ["Frontend", "Next.js 16, React 19, Tailwind v4, Framer Motion"],
    ["Backend", "Next.js API routes, TypeScript 5.8"],
    ["Blockchain", "Viem 2.47, Solidity 0.8.24 (Foundry)"],
    ["AI", "Venice AI (llama-3.3-70b via OpenAI SDK)"],
    ["Bot", "grammy 1.41 (Telegram)"],
    ["Data", "Blockscout API (per-chain), ERC-8004 Registry, Olas Registry"],
    ["Deploy", "Vercel (web), Render (bot worker)"],
  ];
  stack.forEach(([layer, tech], i) => {
    techStack.addShape(pptx.ShapeType.roundRect, {
      x: 1.2,
      y: 1.6 + i * 0.75,
      w: 2.5,
      h: 0.55,
      fill: { color: COLORS.bgCard },
      rectRadius: 0.08,
    });
    techStack.addText(layer, {
      x: 1.4,
      y: 1.6 + i * 0.75,
      w: 2.3,
      h: 0.55,
      fontSize: 15,
      bold: true,
      color: COLORS.primary,
      fontFace: FONT_BODY,
      valign: "middle",
    });
    techStack.addText(tech, {
      x: 4.0,
      y: 1.6 + i * 0.75,
      w: 8.0,
      h: 0.55,
      fontSize: 14,
      color: COLORS.text,
      fontFace: FONT_BODY,
      valign: "middle",
    });
  });
  addSlideNumber(techStack, slideNum, TOTAL_SLIDES);

  // --- Slide 6: Smart Contracts ---
  slideNum++;
  const contracts = pptx.addSlide();
  contracts.background = { color: COLORS.bg };
  contracts.addText("Smart Contracts", {
    x: 1.0,
    y: 0.5,
    w: 11,
    h: 0.8,
    fontSize: 36,
    bold: true,
    color: COLORS.primary,
    fontFace: FONT_TITLE,
  });
  contracts.addText("AgentBlocklist", {
    x: 1.2,
    y: 1.8,
    w: 10,
    h: 0.6,
    fontSize: 22,
    bold: true,
    color: COLORS.text,
    fontFace: FONT_BODY,
  });
  contracts.addText("Deployed on Base Sepolia (testnet)  \u00b7  0x1E3ba77E2D73B5B70a6D534454305b02e425abBA", {
    x: 1.2,
    y: 2.4,
    w: 10,
    h: 0.5,
    fontSize: 14,
    color: COLORS.textMuted,
    fontFace: FONT_BODY,
  });
  const contractFeatures = [
    "Owner-controlled registry of flagged agent addresses",
    "Public isBlocked(address) reads for anyone to query",
    "blockAgent / unblockAgent / blockAgentsBatch write functions",
    "On-chain attestation storage for audit results (ERC-7506)",
  ];
  contractFeatures.forEach((feat, i) => {
    contracts.addText(`\u2022  ${feat}`, {
      x: 1.4,
      y: 3.3 + i * 0.7,
      w: 10,
      h: 0.5,
      fontSize: 17,
      color: COLORS.text,
      fontFace: FONT_BODY,
    });
  });
  addSlideNumber(contracts, slideNum, TOTAL_SLIDES);

  // --- Slide 7: Live Demo ---
  slideNum++;
  const demo = pptx.addSlide();
  demo.background = { color: COLORS.bg };
  demo.addText("Live Demo", {
    x: 1.0,
    y: 0.5,
    w: 11,
    h: 0.8,
    fontSize: 36,
    bold: true,
    color: COLORS.primary,
    fontFace: FONT_TITLE,
  });
  demo.addText("agent-auditor-two.vercel.app", {
    x: 1.2,
    y: 1.8,
    w: 10,
    h: 0.6,
    fontSize: 22,
    color: COLORS.safe,
    fontFace: FONT_BODY,
    hyperlink: { url: "https://agent-auditor-two.vercel.app" },
  });
  const demoSteps = [
    "Landing page \u2192 Launch Dashboard",
    "Paste any agent address or select a provided example",
    "Pick a chain or scan All Chains simultaneously",
    "Trust score renders: overall score, 4-axis breakdown, behavioral narrative",
    "Transaction table with decoded method labels and value flows",
  ];
  demoSteps.forEach((step, i) => {
    demo.addText(`${i + 1}.  ${step}`, {
      x: 1.4,
      y: 2.8 + i * 0.75,
      w: 10,
      h: 0.6,
      fontSize: 16,
      color: COLORS.text,
      fontFace: FONT_BODY,
    });
  });
  addSlideNumber(demo, slideNum, TOTAL_SLIDES);

  // --- Slide 8: Close ---
  slideNum++;
  const close = pptx.addSlide();
  close.background = { color: COLORS.bg };
  close.addText("AgentAuditor", {
    x: 1.5,
    y: 2.2,
    w: 10,
    h: 1.2,
    fontSize: 48,
    bold: true,
    color: COLORS.primary,
    fontFace: FONT_TITLE,
    align: "center",
  });
  close.addText("Forensic trust intelligence for the autonomous economy", {
    x: 1.5,
    y: 3.5,
    w: 10,
    h: 0.8,
    fontSize: 22,
    color: COLORS.text,
    fontFace: FONT_BODY,
    align: "center",
  });
  close.addText("Built on Base  \u00b7  Blockscout  \u00b7  Venice AI", {
    x: 1.5,
    y: 4.6,
    w: 10,
    h: 0.6,
    fontSize: 18,
    color: COLORS.textMuted,
    fontFace: FONT_BODY,
    align: "center",
  });
  close.addText("github.com/dmustapha/agent-auditor", {
    x: 1.5,
    y: 5.8,
    w: 10,
    h: 0.5,
    fontSize: 14,
    color: COLORS.textMuted,
    fontFace: FONT_BODY,
    align: "center",
    hyperlink: { url: "https://github.com/dmustapha/agent-auditor" },
  });
  addSlideNumber(close, slideNum, TOTAL_SLIDES);

  // Write file
  const outPath = `${process.cwd()}/submission/pitch-deck.pptx`;
  await pptx.writeFile({ fileName: outPath });
  console.log(`Pitch deck written to: ${outPath}`);
}

generateDeck().catch(console.error);
