"use client";

import { useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useRecentAudits } from "@/hooks/useRecentAudits";
import { useDirectory } from "@/hooks/useDirectory";
import { LandingPage } from "./components/LandingPage";

function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { records: recentAudits } = useRecentAudits();
  const { allAgents } = useDirectory(null, "score", recentAudits);

  const agentCount = useMemo(() => {
    const addresses = new Set([
      ...allAgents.map(a => a.address.toLowerCase()),
      ...recentAudits.map(r => r.address.toLowerCase()),
    ]);
    return addresses.size || 1;
  }, [allAgents, recentAudits]);

  // Redirect old /?address=...&chain=... URLs to /dashboard
  useEffect(() => {
    const address = searchParams.get("address");
    if (address) {
      const chain = searchParams.get("chain");
      const params = new URLSearchParams();
      params.set("address", address);
      if (chain) params.set("chain", chain);
      router.replace(`/dashboard?${params.toString()}`);
    }
  }, [searchParams, router]);

  const handleLaunch = () => {
    router.push("/dashboard");
  };

  return <LandingPage onLaunch={handleLaunch} agentCount={agentCount} />;
}

export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
