import cron from "node-cron";
import { runApprovalReminderTick } from "./careerApproval.service.js";
import { ensureCareerApprovalTables } from "./careerApproval.model.js";

const ENABLED =
  String(process.env.CAREER_APPROVAL_REMINDERS_ENABLED || "true").toLowerCase() ===
  "true";

async function guardedRun() {
  try {
    const result = await runApprovalReminderTick();
    if (result.ran && result.reminded) {
      console.log(`[career-approval] sent ${result.reminded} reminder(s)`);
    }
  } catch (err) {
    console.error("[career-approval] reminder tick failed:", err?.message || err);
  }
}

export async function ensureCareerApprovalReady() {
  try {
    await ensureCareerApprovalTables();
    console.log("[career-approval] tables ready");
  } catch (err) {
    console.error("[career-approval] setup failed:", err.message);
  }
}

export function startCareerApprovalScheduler() {
  if (!ENABLED) {
    console.log(
      "[career-approval] reminders disabled (CAREER_APPROVAL_REMINDERS_ENABLED=false)",
    );
    return;
  }
  cron.schedule("*/15 * * * *", guardedRun, { timezone: "Asia/Kolkata" });
  console.log("[career-approval] reminder scheduler every 15 minutes");
}
