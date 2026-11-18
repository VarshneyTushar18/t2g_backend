import cron from "node-cron";
import { runBlog20AutomationTick } from "./blog20.automation.service.js";

const ENABLED =
  String(process.env.BLOG_20_AUTOMATIONS_ENABLED || "true").toLowerCase() === "true";

let tickInFlight = false;

async function guardedRun() {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const result = await runBlog20AutomationTick();
    if (result.ran && result.processed) {
      const ok = (result.results || []).filter((r) => r.ok).length;
      console.log(
        `[blog20-automations] processed ${result.processed} topic(s), ${ok} succeeded`,
      );
    } else if (result.ran && result.autoResearchError) {
      console.error("[blog20-automations] research error:", result.autoResearchError);
    }
  } catch (err) {
    console.error("[blog20-automations] tick failed:", err?.message || err);
  } finally {
    tickInFlight = false;
  }
}

export function startBlog20AutomationsScheduler() {
  if (!ENABLED) {
    console.log("[blog20-automations] scheduler disabled (BLOG_20_AUTOMATIONS_ENABLED=false)");
    return;
  }
  cron.schedule("* * * * *", guardedRun);
  console.log("[blog20-automations] scheduler running every minute");
}
