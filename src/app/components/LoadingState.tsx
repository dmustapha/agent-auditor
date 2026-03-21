"use client";

export interface LoadingStep {
  readonly label: string;
  readonly detail?: string;
  readonly status: "pending" | "active" | "complete";
}

interface LoadingStateProps {
  readonly steps: readonly LoadingStep[];
}

export function LoadingState({ steps }: LoadingStateProps) {
  return (
    <div style={{ maxWidth: "28rem", margin: "2rem auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        {steps.map((step, i) => (
          <div key={i}>
            <div className={`aa-loading-step aa-loading-step--${step.status}`}>
              {step.status === "complete" ? (
                <svg className="aa-loading-check" width="10" height="10" viewBox="0 0 16 16" fill="#22c55e">
                  <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                </svg>
              ) : (
                <div className={`aa-loading-dot aa-loading-dot--${step.status}`} />
              )}
              <span className={`aa-loading-label aa-loading-label--${step.status}`}>
                {step.label}
              </span>
            </div>
            {step.status === "complete" && step.detail && (
              <div className="aa-loading-detail">{step.detail}</div>
            )}
          </div>
        ))}
      </div>

      {/* Skeleton placeholder */}
      <div className="aa-skeleton">
        <div className="aa-skeleton-bar" style={{ width: "100%" }} />
        <div className="aa-skeleton-bar" style={{ width: "85%" }} />
        <div className="aa-skeleton-bar" style={{ width: "70%" }} />
        <div style={{ display: "flex", gap: "1rem" }}>
          <div className="aa-skeleton-bar" style={{ width: "45%", height: "4rem" }} />
          <div className="aa-skeleton-bar" style={{ width: "45%", height: "4rem" }} />
        </div>
        <div className="aa-skeleton-bar" style={{ width: "60%" }} />
      </div>

      <p className="aa-loading-hint">Analysis typically takes 10-20 seconds</p>
    </div>
  );
}
