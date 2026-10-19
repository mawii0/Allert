// Display branding only. Keep the runtime, stored records and verification IDs unchanged.
const SEED7_RUNTIME_ID = "median-residual-seed7-epoch15-20261013-v1";
export function modelDisplayName(id?: string | null) {
  if (!id) return "No neural output available";
  return id === SEED7_RUNTIME_ID ? "ALLERT-Model-Node1-4M-Iloilo-v1" : id;
}
