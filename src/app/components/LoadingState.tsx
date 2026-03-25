"use client";

import { useEffect, useState } from "react";

export interface LoadingStep {
  readonly label: string;
  readonly detail?: string;
  readonly status: "pending" | "active" | "complete";
}

interface LoadingStateProps {
  readonly steps: readonly LoadingStep[];
}

export function LoadingState({ steps }: LoadingStateProps) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  const completedCount = steps.filter((s) => s.status === "complete").length;
  const activeStep = steps.find((s) => s.status === "active");
  const progress = ((completedCount + (activeStep ? 0.5 : 0)) / steps.length) * 100;

  return (
    <div className="aa-loader">
      {/* Orbital animation */}
      <div className="aa-loader-orb">
        <div className="aa-loader-ring aa-loader-ring--1" />
        <div className="aa-loader-ring aa-loader-ring--2" />
        <div className="aa-loader-ring aa-loader-ring--3" />
        <div className="aa-loader-core">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 12l2 2 4-4" />
            <path d="M12 3a9 9 0 110 18 9 9 0 010-18z" strokeDasharray={`${progress * 0.565} 56.5`} />
          </svg>
        </div>
      </div>

      {/* Status text */}
      <div className="aa-loader-status">
        <span className="aa-loader-label">
          {activeStep?.label.replace("...", "") ?? "Processing"}{dots}
        </span>
        <span className="aa-loader-counter">
          {completedCount}/{steps.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="aa-loader-track">
        <div
          className="aa-loader-fill"
          style={{ width: `${progress}%` }}
        />
        {steps.map((step, i) => (
          <div
            key={i}
            className={`aa-loader-segment aa-loader-segment--${step.status}`}
            style={{ left: `${((i + 1) / steps.length) * 100}%` }}
          />
        ))}
      </div>

      {/* Completed steps as compact tags */}
      <div className="aa-loader-tags">
        {steps.map((step, i) => (
          <span
            key={i}
            className={`aa-loader-tag aa-loader-tag--${step.status}`}
          >
            {step.status === "complete" && (
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
              </svg>
            )}
            {step.label.replace("...", "")}
          </span>
        ))}
      </div>
    </div>
  );
}
