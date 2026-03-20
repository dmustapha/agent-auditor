export function LoadingState() {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-8 text-center">
      <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      <p className="mt-3 text-sm text-text-secondary">
        Fetching onchain data and running analysis...
      </p>
    </div>
  );
}
