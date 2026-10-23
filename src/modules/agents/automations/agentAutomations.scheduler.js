import cron from "node-cron";
import { runAutomationTick } from "./agentAutomations.service.js";

const ENABLED =
  String(process.env.AGENT_AUTOMATIONS_ENABLED || "true").toLowerCase() === "true";

let tickInFlight = false;

async function guardedRun() {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const result = await runAutomationTick();
    if (result.ran && result.processed) {
      const ok = (result.results || []).filter((r) => r.ok).length;
      console.log(
        `[agent-automations] processed ${result.processed} topic(s), ${ok} succeeded`,
      );
    } else if (result.ran && result.autoTrendingError) {
      console.error("[agent-automations] trending error:", result.autoTrendingError);
    }
  } catch (err) {
    console.error("[agent-automations] tick failed:", err?.message || err);
  } finally {
    tickInFlight = false;
  }
}

export function startAgentAutomationsScheduler() {
  if (!ENABLED) {
    console.log("[agent-automations] scheduler disabled (AGENT_AUTOMATIONS_ENABLED=false)");
    return;
  }
  // Every minute — schedule logic uses admin timezone + catch-up window (not server clock).
  cron.schedule("* * * * *", guardedRun);
  console.log("[agent-automations] scheduler running every minute (timezone from admin settings)");
}
