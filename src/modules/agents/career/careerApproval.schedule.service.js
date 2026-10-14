import * as approvalModel from "./careerApproval.model.js";
import * as careerModel from "../../career/career.model.js";
import {
  buildPublishIntakeEmail,
  buildScheduleGateEmail,
  buildScheduleGateUrls,
  getPublicApiBase,
  renderManageJobsPage,
  renderPublishIntakeFormPage,
  renderScheduleGateDecisionPage,
  sendHtmlEmail,
  verifyCareerLinkToken,
} from "./careerApproval.email.js";
import { runScheduledJobDraft } from "./careerAgent.service.js";
import * as topicModel from "./careerAutomations.model.js";

function parseEmails(value) {
  if (Array.isArray(value)) {
    return [
      ...new Set(
        value.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean),
      ),
    ];
  }
  return [
    ...new Set(
      String(value || "")
        .split(/[,;\n]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

async function resolveHrRecipients(overrideEmails) {
  const settings = await approvalModel.getSettings();
  const fromSettings = parseEmails(settings.approval_emails);
  const fromOverride = parseEmails(overrideEmails);
  const fallback = parseEmails(process.env.OWNER_EMAILS || process.env.TEST_EMAIL || "");
  const recipients = fromOverride.length
    ? fromOverride
    : fromSettings.length
      ? fromSettings
      : fallback;
  return { settings, recipients };
}

const TZ = "Asia/Kolkata";

function nowInKolkata() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: TZ }),
  );
}

function parseTimeLocal(value) {
  const m = String(value || "10:00").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { hour: 10, minute: 0 };
  return {
    hour: Math.min(23, Math.max(0, parseInt(m[1], 10))),
    minute: Math.min(59, Math.max(0, parseInt(m[2], 10))),
  };
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a, b) {
  return Math.floor((startOfDay(b) - startOfDay(a)) / 86400000);
}

function monthDiff(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function scheduleLabel(settings) {
  const n = settings.schedule_every_n || 1;
  if (settings.schedule_frequency === "weeks") {
    const days = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const wd = days[settings.schedule_weekday] || "Mon";
    return n === 1 ? `every ${wd}` : `every ${n} weeks on ${wd}`;
  }
  if (settings.schedule_frequency === "months") {
    return n === 1 ? "every month" : `every ${n} months`;
  }
  return n === 1 ? "every day" : `every ${n} days`;
}

function parseRunDays(settings) {
  const raw = settings.schedule_run_days;
  if (!Array.isArray(raw) || !raw.length) return null;
  return raw.map((d) => Number(d)).filter((n) => n >= 0 && n <= 6);
}

export function shouldRunCareerSchedule(settings) {
  if (!settings.schedule_enabled || !settings.enabled) return false;

  const now = nowInKolkata();
  const runDays = parseRunDays(settings);
  if (runDays && !runDays.includes(now.getDay())) return false;

  const { hour, minute } = parseTimeLocal(settings.schedule_time_local);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const runMinutes = hour * 60 + minute;
  if (nowMinutes < runMinutes || nowMinutes > runMinutes + 14) return false;

  const last = settings.schedule_last_sent_at
    ? new Date(
        new Date(settings.schedule_last_sent_at).toLocaleString("en-US", {
          timeZone: TZ,
        }),
      )
    : null;

  const freq = settings.schedule_frequency || "days";
  const every = Math.max(1, Number(settings.schedule_every_n) || 7);

  if (!last) return true;

  if (freq === "days") {
    return daysBetween(last, now) >= every;
  }

  if (freq === "weeks") {
    const want = Math.min(7, Math.max(1, Number(settings.schedule_weekday) || 1));
    const jsDay = want === 7 ? 0 : want;
    if (now.getDay() !== jsDay) return false;
    return daysBetween(last, now) >= 7 * every;
  }

  if (freq === "months") {
    if (monthDiff(last, now) < every) return false;
    return now.getDate() >= last.getDate();
  }

  return false;
}

export const isScheduleDue = shouldRunCareerSchedule;

async function buildDraftPromptFromQueue(settings) {
  const topic = await topicModel.getNextQueuedTopic();
  if (!topic) {
    return (
      settings.schedule_agent_prompt?.trim() ||
      "Using Tech2Globe career guidelines, draft ONE new job opening appropriate for our careers page. Fill all fields. Create as pending HR approval and notify HR by email."
    );
  }
  await topicModel.markTopicProcessing(topic.id);
  return {
    topicId: topic.id,
    prompt: [
      settings.schedule_agent_prompt?.trim() ||
        "Draft ONE complete job post for Tech2Globe careers page.",
      `Role focus: ${topic.title_hint}`,
      topic.notes ? `Notes: ${topic.notes}` : "",
      "Call create_job_post with full skills and responsibilities. Status pending_approval. Notify HR.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

async function runScheduleAutoDraft({ force = false, settings: settingsIn = null } = {}) {
  const settings = settingsIn || (await approvalModel.getSettings());
  if (!force && !shouldRunCareerSchedule(settings)) {
    return { ran: false, reason: "not_due" };
  }

  let topicId = null;
  try {
    const built = await buildDraftPromptFromQueue(settings);
    const prompt = typeof built === "string" ? built : built.prompt;
    topicId = typeof built === "string" ? null : built.topicId;
    await runScheduledJobDraft({
      prompt,
      requesterEmail: "career-scheduler@tech2globe.com",
    });
    if (topicId) {
      await topicModel.markTopicDraftReady(topicId, null);
    }
    await approvalModel.touchScheduleLastSent();
    console.log("[career-schedule] auto-draft completed; HR publish email sent by agent tools");
    return {
      ran: true,
      sent: true,
      mode: "publish_email",
      message:
        "Career Agent drafted a job and emailed HR the full publish approval (Yes/No + JD + live jobs).",
    };
  } catch (err) {
    console.error("[career-schedule] auto-draft failed:", err.message);
    if (topicId) {
      await topicModel.markTopicFailed(topicId, err.message);
    }
    return { ran: true, sent: false, mode: "publish_email", error: err.message };
  }
}

export async function runScheduleGateTick({ force = false } = {}) {
  await approvalModel.expireStaleScheduleCycles();
  const settings = await approvalModel.getSettings();
  if (!settings.schedule_enabled || !settings.enabled) {
    return { ran: false, reason: "schedule_disabled" };
  }
  if (!getPublicApiBase()) {
    return { ran: false, reason: "missing_BACKEND_PUBLIC_URL" };
  }
  if (!force && !shouldRunCareerSchedule(settings)) {
    return { ran: false, reason: "not_due" };
  }

  const pending = await approvalModel.getPendingScheduleCycle();
  if (pending) {
    return { ran: false, reason: "pending_cycle_exists" };
  }

  const { recipients } = await resolveHrRecipients(settings.approval_emails);
  if (!recipients.length) {
    return { ran: false, reason: "no_hr_emails" };
  }

  const cycle = await approvalModel.createScheduleCycle({
    hrEmails: recipients,
    expiryHours: settings.schedule_gate_expiry_hours,
  });

  const urls = buildScheduleGateUrls(cycle.id, cycle.expiresAt);
  if (urls.missingBase) {
    return { ran: false, reason: "missing_BACKEND_PUBLIC_URL" };
  }

  let activeJobs = [];
  try {
    activeJobs = await careerModel.getAllActiveJobs();
  } catch {
    activeJobs = [];
  }

  const mail = buildScheduleGateEmail({
    expiresAt: cycle.expiresAt,
    yesUrl: urls.yesUrl,
    noUrl: urls.noUrl,
    manageUrl: urls.manageUrl,
    activeJobs,
    scheduleLabel: scheduleLabel(settings),
  });

  await sendHtmlEmail({
    to: recipients,
    subject: mail.subject,
    html: mail.html,
  });

  await approvalModel.touchScheduleLastSent();

  console.log(
    `[career-schedule] gate email sent cycle=${cycle.id} → ${recipients.join(", ")}`,
  );

  return { ran: true, sent: true, cycleId: cycle.id, recipients };
}

/** Admin: test cron — full publish email or gate email depending on schedule_mode. */
export async function sendTestScheduleGateEmail() {
  if (!getPublicApiBase()) {
    const err = new Error("Set BACKEND_PUBLIC_URL for email links");
    err.status = 503;
    throw err;
  }
  const { recipients } = await resolveHrRecipients(null);
  if (!recipients.length) {
    const err = new Error("Add at least one HR email");
    err.status = 400;
    throw err;
  }
  const cycle = await approvalModel.createScheduleCycle({
    hrEmails: recipients,
    expiryHours: settings.schedule_gate_expiry_hours,
  });
  const urls = buildScheduleGateUrls(cycle.id, cycle.expiresAt);
  let activeJobs = [];
  try {
    activeJobs = await careerModel.getAllActiveJobs();
  } catch {
    activeJobs = [];
  }
  const mail = buildScheduleGateEmail({
    expiresAt: cycle.expiresAt,
    yesUrl: urls.yesUrl,
    noUrl: urls.noUrl,
    manageUrl: urls.manageUrl,
    activeJobs,
    scheduleLabel: "test send",
  });
  await sendHtmlEmail({
    to: recipients,
    subject: `[TEST] ${mail.subject}`,
    html: mail.html,
  });
  return { sent: true, cycleId: cycle.id, recipients };
}

export async function handleScheduleGateAction({ token, actorEmail = null }) {
  let payload;
  try {
    payload = verifyCareerLinkToken(token);
  } catch {
    return {
      status: 400,
      html: renderScheduleGateDecisionPage({
        ok: false,
        accepted: false,
        message: "This link is invalid or expired.",
      }),
    };
  }

  if (payload.typ !== "career_schedule_gate") {
    return null;
  }

  const cycle = await approvalModel.getScheduleCycleById(payload.aid);
  if (!cycle) {
    return {
      status: 404,
      html: renderScheduleGateDecisionPage({
        ok: false,
        accepted: false,
        message: "This scheduled check-in was not found.",
      }),
    };
  }

  if (new Date(cycle.expires_at).getTime() < Date.now()) {
    await approvalModel.markScheduleCycleDecision(cycle.id, "expired");
    return {
      status: 410,
      html: renderScheduleGateDecisionPage({
        ok: false,
        accepted: false,
        message: "This check-in has expired. Wait for the next scheduled email.",
      }),
    };
  }

  if (payload.act === "manage_list") {
    const activeJobs = await careerModel.getAllActiveJobs();
    const urls = buildScheduleGateUrls(cycle.id, cycle.expires_at);
    return {
      status: 200,
      html: renderManageJobsPage({
        activeJobs,
        manageUrl: urls.manageUrl,
        manageToken: token,
      }),
    };
  }

  if (payload.act === "intake_form") {
    if (cycle.decision !== "awaiting_intake") {
      return {
        status: 409,
        html: renderScheduleGateDecisionPage({
          ok: false,
          accepted: false,
          message:
            cycle.decision === "completed"
              ? "This form was already submitted."
              : "Open the link from the “Describe the job” email after you click Yes — Publish.",
        }),
      };
    }
    const activeJobs = await careerModel.getAllActiveJobs();
    const urls = buildScheduleGateUrls(cycle.id, cycle.expires_at);
    return {
      status: 200,
      html: renderPublishIntakeFormPage({
        activeJobs,
        manageUrl: urls.manageUrl,
        intakeToken: token,
      }),
    };
  }

  if (cycle.decision !== "pending") {
    return {
      status: 409,
      html: renderScheduleGateDecisionPage({
        ok: false,
        accepted: cycle.decision === "awaiting_intake" || cycle.decision === "completed",
        message: `This check-in was already ${cycle.decision}.`,
      }),
    };
  }

  if (payload.act === "schedule_no") {
    await approvalModel.markScheduleCycleDecision(cycle.id, "declined");
    return {
      status: 200,
      html: renderScheduleGateDecisionPage({
        ok: true,
        accepted: false,
        message: "Understood. No job will be published this cycle.",
      }),
    };
  }

  if (payload.act !== "schedule_yes") {
    return {
      status: 400,
      html: renderScheduleGateDecisionPage({
        ok: false,
        accepted: false,
        message: "Unknown action.",
      }),
    };
  }

  await approvalModel.markScheduleCycleDecision(cycle.id, "awaiting_intake");

  const urls = buildScheduleGateUrls(cycle.id, cycle.expires_at);
  const intakeMail = buildPublishIntakeEmail({
    intakeFormUrl: urls.intakeFormUrl,
    expiresAt: cycle.expires_at,
  });
  const recipients = parseEmails(cycle.hr_emails);
  await sendHtmlEmail({
    to: recipients,
    subject: intakeMail.subject,
    html: intakeMail.html,
    replyTo: actorEmail || undefined,
  });

  return {
    status: 200,
    html: renderScheduleGateDecisionPage({
      ok: true,
      accepted: true,
      message:
        "Thank you. Check your inbox for the next email: “What do you want to publish?” — open the form, add job details, and send to the Career Agent.",
    }),
  };
}

export async function handlePublishIntakeSubmit({
  token,
  title_hint,
  comment,
  actorEmail = null,
}) {
  let payload;
  try {
    payload = verifyCareerLinkToken(token);
  } catch {
    return {
      status: 400,
      html: renderScheduleGateDecisionPage({
        ok: false,
        accepted: false,
        message: "This form link is invalid or expired.",
      }),
    };
  }

  if (payload.typ !== "career_schedule_gate" || payload.act !== "intake_form") {
    return {
      status: 400,
      html: renderScheduleGateDecisionPage({
        ok: false,
        accepted: false,
        message: "Invalid form submission.",
      }),
    };
  }

  const cycle = await approvalModel.getScheduleCycleById(payload.aid);
  if (!cycle || cycle.decision !== "awaiting_intake") {
    return {
      status: 409,
      html: renderScheduleGateDecisionPage({
        ok: false,
        accepted: false,
        message: "This form is closed or already submitted.",
      }),
    };
  }

  const text = String(comment || "").trim();
  if (text.length < 20) {
    const activeJobs = await careerModel.getAllActiveJobs();
    const urls = buildScheduleGateUrls(cycle.id, cycle.expires_at);
    return {
      status: 400,
      html: renderPublishIntakeFormPage({
        activeJobs,
        manageUrl: urls.manageUrl,
        intakeToken: token,
        errorMessage: "Please enter at least a few lines describing the job (20+ characters).",
      }),
    };
  }

  await approvalModel.saveScheduleIntakeNotes(cycle.id, text, actorEmail);

  const settings = await approvalModel.getSettings();
  const titleLine = String(title_hint || "").trim();
  const prompt = [
    "HR submitted this via the scheduled careers publish form. Create ONE job post from it.",
    titleLine ? `Preferred title: ${titleLine}` : "",
    `HR comments / JD:\n${text}`,
    "Call create_job_post with full skills and responsibilities. Use pending_approval and notify HR by email.",
  ]
    .filter(Boolean)
    .join("\n\n");

  let topicId = null;
  try {
    const built = await buildDraftPromptFromQueue(settings);
    if (typeof built !== "string" && built.topicId) {
      topicId = built.topicId;
    }
    await runScheduledJobDraft({
      prompt,
      requesterEmail: actorEmail || "hr-form@tech2globe.com",
    });
    if (topicId) {
      await topicModel.markTopicDraftReady(topicId, null);
    }
    await approvalModel.markScheduleCycleDecision(cycle.id, "completed", {
      fromStates: ["awaiting_intake"],
    });
    return {
      status: 200,
      html: renderScheduleGateDecisionPage({
        ok: true,
        accepted: true,
        message:
          "Sent to the Career Agent. You will receive the usual email with the full job description and Yes — Publish / No buttons shortly.",
      }),
    };
  } catch (err) {
    console.error("[career-schedule] intake submit failed:", err.message);
    if (topicId) {
      await topicModel.markTopicFailed(topicId, err.message);
    }
    const activeJobs = await careerModel.getAllActiveJobs();
    const urls = buildScheduleGateUrls(cycle.id, cycle.expires_at);
    return {
      status: 500,
      html: renderPublishIntakeFormPage({
        activeJobs,
        manageUrl: urls.manageUrl,
        intakeToken: token,
        errorMessage: err.message || "Career Agent could not create the job. Check AI keys and try again.",
      }),
    };
  }
}
