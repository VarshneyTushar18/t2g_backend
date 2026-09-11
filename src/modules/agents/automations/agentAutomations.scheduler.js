import cron from "node-cron";
import { runAutomationTick } from "./agentAutomations.service.js";

const ENABLED =
  String(process.env.AGENT_AUTOMATIONS_ENABLED || "true").toLowerCase() === "true";

async function guardedRun() {
  try {
    const result = await runAutomationTick();
    if (result.ran && result.processed) {
      console.log(`[agent-automations] processed ${result.processed} topic(s)`);
    }
  } catch (err) {
    console.error("[agent-automations] tick failed:", err?.message || err);
  }
}

export function startAgentAutomationsScheduler() {
  if (!ENABLED) {
    console.log("[agent-automations] scheduler disabled (AGENT_AUTOMATIONS_ENABLED=false)");
    return;
  }
  cron.schedule("*/5 * * * *", guardedRun, { timezone: "Asia/Kolkata" });
  console.log("[agent-automations] scheduler running every 5 minutes");
}
