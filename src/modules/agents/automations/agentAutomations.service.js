import * as automationModel from "./agentAutomations.model.js";
import * as blogAgentModel from "../blog/blogAgent.model.js";
import { runBlogAgent } from "../blog/blogAgent.service.js";
import * as blogModel from "../../blog/blog.model.js";
import { transporter, getSmtpFromAddress } from "../../../utils/email.service.js";
import {
  requestBlogPublishApproval,
  sendTestApprovalEmail,
} from "./blogApproval.service.js";

function parseEmails(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBlogCreation(resultText, posts = []) {
  if (Array.isArray(posts) && posts[0]?.id) {
    return {
      postId: Number(posts[0].id),
      slug: posts[0].slug || null,
    };
  }
  const text = String(resultText || "");
  const idMatch = text.match(/\b(?:id|post id)\D{0,6}(\d{1,10})\b/i);
  const slugMatch = text.match(/\/blogs\/([a-z0-9-]+)/i);
  return {
    postId: idMatch ? Number(idMatch[1]) : null,
    slug: slugMatch ? slugMatch[1] : null,
  };
}

function shouldRunNow(settings) {
  if (!settings.enabled) return false;

  const now = new Date();
  if (settings.window_start && now < new Date(settings.window_start)) return false;
  if (settings.window_end && now > new Date(settings.window_end)) return false;

  const runDays = Array.isArray(settings.run_days) ? settings.run_days : [];
  if (runDays.length && !runDays.includes(now.getDay())) return false;

  const [hour, minute] = String(settings.run_time || "10:00")
    .split(":")
    .map((n) => Number(n));
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const runMinutes = (Number(hour) || 0) * 60 + (Number(minute) || 0);
  if (nowMinutes < runMinutes || nowMinutes > runMinutes + 4) return false;

  if (settings.last_run_at) {
    const last = new Date(settings.last_run_at);
    if (
      last.getFullYear() === now.getFullYear() &&
      last.getMonth() === now.getMonth() &&
      last.getDate() === now.getDate()
    ) {
      return false;
    }
  }
  return true;
}

function buildPrompt(topic, status) {
  const tags = (topic.tags || []).join(", ");
  const categories = (topic.category_ids || []).join(", ");
  const author = topic.author_name || "Tech2Globe Digital Team";
  return [
    `Create a complete SEO blog post on topic: "${topic.topic}"`,
    `Set status to ${status}.`,
    `Author name: ${author}.`,
    tags ? `Use tags: ${tags}.` : "",
    categories ? `Use category IDs: ${categories}.` : "",
    topic.notes ? `Extra instructions: ${topic.notes}` : "",
    "Mandatory: call create_blog_post tool and then clearly mention created id and public url in final response.",
    "Write like a top industry blog (HubSpot/Medium): clear H2s, short paragraphs, bullet lists, no raw markdown asterisks.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Notify-only email for auto_publish mode (already live). */
async function sendPublishedNotifyEmail({ post, topic, settings }) {
  const recipients = parseEmails(settings.approval_emails);
  if (!recipients.length) {
    return { sent: false, reason: "no_recipients" };
  }
  const from = getSmtpFromAddress();
  if (!from) {
    return { sent: false, reason: "no_from_address" };
  }

  const webUrl = `https://www.tech2globe.com/blogs/${post.slug}`;
  await transporter.sendMail({
    from: `"Tech2Globe Blog Automations" <${from}>`,
    to: recipients.join(", "),
    subject: `[Published] Blog live: ${post.title}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;max-width:640px;">
        <h2 style="color:#15803d;">Blog auto-published</h2>
        <p>Automation published a new post (mode: auto publish).</p>
        <p><strong>Topic:</strong> ${topic.topic}</p>
        <p><strong>Title:</strong> ${post.title}</p>
        <p><a href="${webUrl}">${webUrl}</a></p>
      </div>
    `,
  });
  return { sent: true, recipients };
}

export async function sendTestSampleEmail(recipientsInput) {
  // Career-style Yes/No + preview test email
  return sendTestApprovalEmail(recipientsInput);
}

async function processTopic(topic, settings) {
  await automationModel.markTopicProcessing(topic.id);

  // pending_email → pending (await Yes/No)
  // draft_only → draft (no email)
  // auto_publish → publish immediately
  let desiredStatus = "pending";
  if (settings.mode === "auto_publish") desiredStatus = "publish";
  else if (settings.mode === "draft_only") desiredStatus = "draft";
  else desiredStatus = "pending";

  const prompt = buildPrompt(topic, desiredStatus);

  const user = {
    id: "agent-automations",
    sub: "agent-automations",
    email: "agent-automations@system.local",
    role: "super_admin",
    permissions: { blog: { add: true, delete: true, edit: true, view: true } },
  };

  const thread = await blogAgentModel.createThread({
    userId: "agent-automations",
    userEmail: user.email,
    title: `Automation: ${topic.topic}`.slice(0, 120),
    agentType: "automation",
  });
  await blogAgentModel.addMessage({
    threadId: thread.id,
    role: "user",
    content: prompt,
  });

  const runResult = await runBlogAgent({ user, threadId: thread.id, message: prompt });
  await blogAgentModel.addMessage({
    threadId: thread.id,
    role: "assistant",
    content: String(runResult.output || "Done."),
    toolOutput: {
      durationMs: runResult.durationMs || null,
      source: "agent-automations",
      posts: runResult.posts || [],
    },
  });

  const parsed = parseBlogCreation(runResult.output, runResult.posts);
  if (!parsed.postId) {
    throw new Error("Could not detect created post id from agent output.");
  }
  const post = await blogModel.getById(parsed.postId);
  if (!post) {
    throw new Error(`Post ${parsed.postId} not found after generation.`);
  }

  await automationModel.markTopicDone(topic.id, {
    generated_post_id: post.id,
    generated_slug: post.slug,
    generated_title: post.title,
  });

  let approval = null;
  if (settings.mode === "pending_email") {
    approval = await requestBlogPublishApproval({
      post,
      topic,
      approvalEmails: settings.approval_emails,
      requestedBy: "agent-automations",
      requesterEmail: "agent-automations@system.local",
    });
  } else if (settings.mode === "auto_publish") {
    await sendPublishedNotifyEmail({ post, topic, settings });
  }
  // draft_only: no email

  return {
    topicId: topic.id,
    postId: post.id,
    title: post.title,
    status: post.status,
    approvalId: approval?.approvalId || null,
  };
}

export async function runAutomationTick() {
  const settings = await automationModel.getSettings();
  if (!shouldRunNow(settings)) {
    return { ran: false, reason: "Not in configured schedule window" };
  }

  const dueTopics = await automationModel.getDueTopics(settings.posts_per_run || 1);
  if (!dueTopics.length) {
    await automationModel.markSettingsLastRun(new Date());
    return { ran: true, processed: 0, results: [] };
  }

  const results = [];
  for (const topic of dueTopics) {
    try {
      const out = await processTopic(topic, settings);
      results.push({ ok: true, ...out });
    } catch (err) {
      await automationModel.markTopicFailed(topic.id, err.message);
      results.push({ ok: false, topicId: topic.id, error: err.message });
    }
  }

  await automationModel.markSettingsLastRun(new Date());
  return { ran: true, processed: dueTopics.length, results };
}

export async function runAutomationNow() {
  const settings = await automationModel.getSettings();
  const dueTopics = await automationModel.getDueTopics(settings.posts_per_run || 1);
  const results = [];
  for (const topic of dueTopics) {
    try {
      const out = await processTopic(topic, settings);
      results.push({ ok: true, ...out });
    } catch (err) {
      await automationModel.markTopicFailed(topic.id, err.message);
      results.push({ ok: false, topicId: topic.id, error: err.message });
    }
  }
  return { processed: dueTopics.length, results };
}
