import * as automationModel from "./agentAutomations.model.js";
import * as blogAgentModel from "../blog/blogAgent.model.js";
import { runBlogAgent } from "../blog/blogAgent.service.js";
import * as blogModel from "../../blog/blog.model.js";
import { transporter, getSmtpFromAddress } from "../../../utils/email.service.js";
import {
  requestBlogPublishApproval,
  sendTestApprovalEmail,
} from "./blogApproval.service.js";
import { DEFAULT_BLOG_AUTOMATION_MEMORY } from "../blog/blogAgentAutomationMemory.js";
import { discoverTrendingTopics } from "./trendingTopicDiscovery.js";
import {
  shouldRunNow as checkScheduleDue,
  describeScheduleStatus,
  sleep,
} from "./agentAutomations.scheduleUtils.js";

export { describeScheduleStatus };

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

const STALE_PROCESSING_MINUTES = Number(
  process.env.AGENT_AUTOMATIONS_STALE_PROCESSING_MIN || 50,
);

async function recoverStaleProcessingTopics() {
  const n = await automationModel.releaseStaleProcessingTopics(STALE_PROCESSING_MINUTES);
  if (n > 0) {
    console.warn(`[agent-automations] released ${n} stale processing topic(s)`);
  }
}

function buildPrompt(topic, status) {
  const tags = (topic.tags || []).join(", ");
  const categoryIds = (topic.category_ids || []).map(Number).filter(Boolean);
  const author = topic.author_name || "Tech2Globe Digital Team";
  return [
    `Create a complete SEO blog post on topic: "${topic.topic}"`,
    `Set status to ${status}.`,
    `Author name: ${author}.`,
    tags ? `Use tags: ${tags}.` : "",
    categoryIds.length
      ? `Mandatory categoryIds in create_blog_post: [${categoryIds.join(", ")}].`
      : "If no categories were set on the topic, pick the best matching blog category id from Tech2Globe site context.",
    topic.notes ? `Extra instructions: ${topic.notes}` : "",
    "IMPORTANT: Skip clarifying questions. Just write it now — do not ask the user anything.",
    "Slug: derive from final title (lowercase, hyphens). Pass slug, metaTitle, metaDescription, focusKeyword in create_blog_post.",
    "Featured image: leave featured_image empty in create_blog_post — the tool auto-picks stock cover. Do NOT call pick_blog_image unless create failed without image.",
    "Use add_inline_images: true. One create_blog_post call with full HTML/Markdown body (~900–1200 words).",
    "Mandatory: call create_blog_post once, then reply with id: {number} and url: https://www.tech2globe.com/blogs/{slug}.",
    "Follow the admin content mix setting from system instructions (humanize % vs AI %). Clear H2s, short paragraphs, no raw markdown asterisks.",
    DEFAULT_BLOG_AUTOMATION_MEMORY,
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

  const runResult = await runBlogAgent({
    user,
    threadId: thread.id,
    message: prompt,
    automationMode: true,
  });
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

async function ensureTopicsForRun(settings) {
  const limit = settings.posts_per_run || 1;
  if (settings.topic_source !== "auto_trending") {
    return { autoGenerated: [] };
  }

  const queued = await automationModel.countQueuedTopics();
  const need = Math.max(0, limit - queued);
  if (!need) return { autoGenerated: [] };

  const avoidTopics = await automationModel.listRecentTopicTitles(50);
  const picks = await discoverTrendingTopics({
    count: need,
    niche: settings.auto_niche,
    avoidTopics,
  });

  const created = [];
  for (const pick of picks) {
    const topic = await automationModel.createTopic({
      topic: pick.topic,
      notes: pick.notes
        ? `[Auto trending]\n${pick.notes}`
        : "[Auto trending] Researched from news and search trends.",
      author_name: settings.auto_default_author_name || "Tech2Globe Digital Team",
      category_ids: settings.auto_default_category_ids || [],
      tags: pick.tags?.length ? pick.tags : settings.auto_default_tags || [],
      priority: 10,
      created_by: "auto-trending",
    });
    created.push(topic);
  }

  console.log(
    `[agent-automations] auto-trending queued ${created.length} topic(s): ${created.map((t) => t.topic).join(" | ")}`,
  );
  return { autoGenerated: created };
}

async function processTopicBatch(settings, dueTopics) {
  const staggerSec = Math.min(
    Math.max(Number(settings.posts_stagger_seconds || 120), 0),
    900,
  );
  const results = [];
  for (let i = 0; i < dueTopics.length; i += 1) {
    const topic = dueTopics[i];
    if (i > 0 && staggerSec > 0) {
      console.log(
        `[agent-automations] stagger ${staggerSec}s before topic #${topic.id}`,
      );
      await sleep(staggerSec * 1000);
    }
    const started = Date.now();
    try {
      const out = await processTopic(topic, settings);
      results.push({
        ok: true,
        ...out,
        durationMs: Date.now() - started,
      });
    } catch (err) {
      await automationModel.markTopicFailed(topic.id, err.message);
      results.push({
        ok: false,
        topicId: topic.id,
        error: err.message,
        durationMs: Date.now() - started,
      });
    }
  }
  return results;
}

export async function runAutomationTick() {
  await recoverStaleProcessingTopics();

  const settings = await automationModel.getSettings();
  const schedule = checkScheduleDue(settings);
  if (!schedule.ok) {
    return { ran: false, reason: schedule.reason || "Not in schedule window" };
  }

  let autoMeta = { autoGenerated: [] };
  try {
    autoMeta = await ensureTopicsForRun(settings);
  } catch (err) {
    console.error("[agent-automations] auto trending failed:", err.message);
    return {
      ran: true,
      processed: 0,
      results: [],
      autoTrendingError: err.message,
    };
  }

  const dueTopics = await automationModel.getDueTopics(settings.posts_per_run || 1);
  if (!dueTopics.length) {
    return {
      ran: true,
      processed: 0,
      results: [],
      autoGeneratedTopics: autoMeta.autoGenerated.map((t) => ({
        id: t.id,
        topic: t.topic,
      })),
    };
  }

  const results = await processTopicBatch(settings, dueTopics);

  await automationModel.markSettingsLastRun(new Date());
  return {
    ran: true,
    processed: dueTopics.length,
    results,
    autoGeneratedTopics: autoMeta.autoGenerated.map((t) => ({
      id: t.id,
      topic: t.topic,
    })),
  };
}

export async function runAutomationNow() {
  await recoverStaleProcessingTopics();

  const settings = await automationModel.getSettings();
  let autoMeta = { autoGenerated: [] };
  if (settings.topic_source === "auto_trending") {
    try {
      autoMeta = await ensureTopicsForRun(settings);
    } catch (err) {
      return {
        processed: 0,
        results: [],
        autoTrendingError: err.message,
      };
    }
  }

  const dueTopics = await automationModel.getDueTopics(settings.posts_per_run || 1);
  const results = await processTopicBatch(settings, dueTopics);
  return {
    processed: dueTopics.length,
    results,
    autoGeneratedTopics: autoMeta.autoGenerated.map((t) => ({
      id: t.id,
      topic: t.topic,
    })),
  };
}
