export function EnvironmentNotice({ status, retry }: { status: string; retry: () => void }) {
  const loading = status === "loading";
  const message = status === "Node access has not been assigned"
    ? "Your signed-in account has not been assigned access to Node 1. Ask the project owner to check your account assignment."
    : loading ? "Checking for stored model results…"
    : status === "unavailable" ? "No verified results are stored yet. Historical results can be published while hardware is being prepared."
    : status.includes("sign in") || status.includes("Sign in") || status.includes("authenticated") ? "Please sign in again to load your model results."
    : "Model results could not be loaded. Check your connection and try again.";
  return <section className="model-card p-4 mb-5" role="status">
    <h2>{loading ? "Loading Model Results" : "Model Results Unavailable"}</h2>
    <p className="text-xs text-zinc-300 leading-relaxed">{message}</p>
    {!loading && <button className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 text-xs text-white" onClick={retry}>Try Again</button>}
  </section>;
}
