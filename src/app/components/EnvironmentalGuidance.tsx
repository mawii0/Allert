import { Shield } from "lucide-react";
import { ADVISORIES } from "../../../supabase/functions/server/seed7-policy.mjs";

type ReadingIndicator = { score_0_100: number; tier: string };
type Indicators = Partial<Record<"adult" | "pediatric", ReadingIndicator>>;
const colors = { low: "#6ee7b7", moderate: "#fde047", high: "#fb923c", very_high: "#f87171" };

export function EnvironmentalGuidance({ risk, stale }: { risk?: Indicators | null; stale: boolean }) {
  return <section className="model-card guidance" aria-labelledby="environmental-guidance-title">
    <div className="shield-icon"><Shield size={21} aria-hidden="true" /></div>
    <div style={{minWidth:0,flex:1}}>
      <h2 id="environmental-guidance-title">Environmental Guidance</h2>
      {stale ? <p>Stored sensor readings are stale. Current conditions are unknown. Check the node's power and Wi-Fi for updated guidance.</p> :
        <div style={{display:"grid",gap:16,marginTop:12}}>
          {(["adult", "pediatric"] as const).map(population => {
            const value = risk?.[population];
            const valid = value && Number.isFinite(value.score_0_100) && Object.hasOwn(ADVISORIES, value.tier);
            const label = population === "adult" ? "Adult" : "Pediatric";
            return <div key={population} aria-label={`${label} environmental guidance`}>
              <p><strong>{label}</strong>{valid && <> · {value.score_0_100.toFixed(1)} /100 · <span style={{color:colors[value.tier]}}>{value.tier.replaceAll("_", " ")}</span></>}</p>
              <p>{valid ? ADVISORIES[value.tier] : "Current indicator unavailable. Guidance will appear when valid readings are received."}</p>
            </div>;
          })}
        </div>}
    </div>
  </section>;
}
