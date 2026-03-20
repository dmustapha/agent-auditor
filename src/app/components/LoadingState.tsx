export function LoadingState() {
  return (
    <div className="aa-loading-card" aria-label="Loading analysis" aria-busy="true">
      {/* Agent header skeleton */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <div className="aa-skeleton" style={{ height: "14px", width: "200px" }} />
          <div className="aa-skeleton" style={{ height: "22px", width: "70px", borderRadius: "9999px" }} />
        </div>
        <div className="aa-skeleton" style={{ height: "22px", width: "80px", borderRadius: "9999px" }} />
      </div>

      {/* Score ring skeleton */}
      <div
        style={{
          display: "flex",
          gap: "2rem",
          alignItems: "center",
          marginBottom: "1.5rem",
          paddingBottom: "1.5rem",
          borderBottom: "1px solid #1e1e22",
        }}
      >
        <div style={{ flex: 1 }}>
          <div className="aa-skeleton" style={{ height: "12px", width: "100px", marginBottom: "0.75rem" }} />
          <div className="aa-skeleton" style={{ height: "22px", width: "220px", marginBottom: "0.5rem" }} />
          <div className="aa-skeleton" style={{ height: "12px", width: "140px" }} />
        </div>
        <div
          className="aa-skeleton"
          style={{ width: "140px", height: "140px", borderRadius: "50%", flexShrink: 0 }}
        />
      </div>

      {/* Summary skeleton */}
      <div
        style={{
          borderLeft: "3px solid #252529",
          paddingLeft: "1.25rem",
          marginBottom: "1.5rem",
        }}
      >
        <div className="aa-skeleton" style={{ height: "10px", width: "120px", marginBottom: "0.65rem" }} />
        <div className="aa-skeleton" style={{ height: "12px", width: "100%", marginBottom: "0.5rem" }} />
        <div className="aa-skeleton" style={{ height: "12px", width: "90%", marginBottom: "0.5rem" }} />
        <div className="aa-skeleton" style={{ height: "12px", width: "75%" }} />
      </div>

      {/* Breakdown skeleton */}
      <div
        style={{
          background: "#131316",
          border: "1px solid #252529",
          borderRadius: "12px",
          padding: "1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <div className="aa-skeleton" style={{ height: "10px", width: "120px", marginBottom: "1.25rem" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem 2rem" }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div
                style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.45rem" }}
              >
                <div className="aa-skeleton" style={{ height: "10px", width: "130px" }} />
                <div className="aa-skeleton" style={{ height: "10px", width: "36px" }} />
              </div>
              <div className="aa-skeleton" style={{ height: "4px", width: "100%" }} />
            </div>
          ))}
        </div>
      </div>

      <p className="aa-loading-hint" aria-live="polite">
        Fetching onchain data and running analysis&hellip;
      </p>
    </div>
  );
}
