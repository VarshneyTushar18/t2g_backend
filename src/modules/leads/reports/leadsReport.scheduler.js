import cron from "node-cron";
import {
  getReportTimezone,
  sendFirstHalfMonthlyReport,
  sendSecondHalfMonthlyReport,
  sendFullMonthlyReport,
} from "./leadsReport.service.js";

const ENABLED = String(process.env.LEADS_REPORT_ENABLED || "false").toLowerCase() === "true";

function isLastDayOfMonth(date) {
  const d = new Date(date);
  return d.getDate() === new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

async function guardedRun(label, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`[leads-report] ${label} failed:`, err?.message || err);
  }
}

export function startLeadsReportScheduler() {
  if (!ENABLED) {
    console.log("[leads-report] Scheduler disabled. Set LEADS_REPORT_ENABLED=true to enable.");
    return;
  }

  const tz = getReportTimezone();
  console.log(`[leads-report] Scheduler enabled. Timezone: ${tz}`);

  // 16th day of month at 09:30 -> send 1st half report (1-15).
  cron.schedule(
    "30 9 16 * *",
    () => guardedRun("first-half report", () => sendFirstHalfMonthlyReport(new Date())),
    { timezone: tz }
  );

  // Daily at 21:10 -> on last day send 2nd half + full month reports.
  cron.schedule(
    "10 21 * * *",
    () =>
      guardedRun("month-end reports", async () => {
        const now = new Date();
        if (!isLastDayOfMonth(now)) return;
        await sendSecondHalfMonthlyReport(now);
        await sendFullMonthlyReport(now);
      }),
    { timezone: tz }
  );
}

