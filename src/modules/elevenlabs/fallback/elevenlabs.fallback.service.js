import { transporter, getSmtpFromAddress } from "../../../utils/email.service.js";
import {
  parseTranscriptPayload,
  buildTranscriptEmailHtml,
  buildTranscriptSubject,
} from "../elevenlabs.service.js";
import { fetchConversation } from "./elevenlabs.api.js";
import {
  enqueuePending,
  findByConversationId,
  incrementAttempt,
  listPending,
  markFailed,
  markSent,
} from "./pending.store.js";

const DONE_STATUSES = new Set(["done"]);
const RETRY_STATUSES = new Set(["initiated", "in-progress", "processing"]);

function getMaxAttempts() {
  return Number(process.env.ELEVENLABS_FALLBACK_MAX_ATTEMPTS || 8);
}

function getRetryMs() {
  return Number(process.env.ELEVENLABS_FALLBACK_RETRY_MS || 15000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function wrapApiResponseToWebhookShape(apiResponse) {
  const eventTs =
    apiResponse?.metadata?.start_time_unix_secs ??
    apiResponse?.metadata?.accepted_time_unix_secs ??
    Math.floor(Date.now() / 1000);

  return {
    type: "post_call_transcription",
    event_timestamp: eventTs,
    data: {
      conversation_id: apiResponse.conversation_id,
      transcript: Array.isArray(apiResponse.transcript) ? apiResponse.transcript : [],
    },
  };
}

function getTranscriptRecipients() {
  return (
    process.env.ELEVENLABS_TRANSCRIPT_EMAIL ||
    process.env.OWNER_EMAILS?.split(",")[0]?.trim() ||
    "harpreet@tech2globe.com"
  );
}

export async function sendTranscriptEmail(webhookShape) {
  const { eventTs, conversationId, formatted } = parseTranscriptPayload(webhookShape);
  const to = getTranscriptRecipients();
  const from = getSmtpFromAddress();
  if (!from) {
    throw new Error("Email sender not configured (set SMTP_EMAIL or EMAIL_USER)");
  }

  const html = buildTranscriptEmailHtml({ conversationId, eventTs, formatted });
  const subject = buildTranscriptSubject(conversationId, eventTs);

  await transporter.sendMail({
    from: `"Chat Support" <${from}>`,
    to,
    subject,
    html,
  });

  console.log(
    `[elevenlabs-fallback] email sent to ${to} (conversation ${conversationId}, messages: ${formatted.length})`,
  );

  return { conversationId, messageCount: formatted.length };
}

async function fetchUntilDone(conversationId) {
  const maxAttempts = getMaxAttempts();
  const retryMs = getRetryMs();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const apiResponse = await fetchConversation(conversationId);
    const status = String(apiResponse?.status ?? "").toLowerCase();

    if (DONE_STATUSES.has(status)) {
      return { ok: true, apiResponse, attempts: attempt };
    }

    if (status === "failed") {
      return {
        ok: false,
        error: "Conversation status is failed",
        apiResponse,
        attempts: attempt,
      };
    }

    if (RETRY_STATUSES.has(status) && attempt < maxAttempts) {
      console.log(
        `[elevenlabs-fallback] conversation ${conversationId} status=${status}, retry ${attempt}/${maxAttempts}`,
      );
      await sleep(retryMs);
      continue;
    }

    return {
      ok: false,
      error: `Conversation not ready (status=${status || "unknown"})`,
      apiResponse,
      attempts: attempt,
    };
  }

  return { ok: false, error: "Max fetch attempts reached", attempts: maxAttempts };
}

export async function notifyConversationEnded({ conversationId, agentId }) {
  if (!conversationId) {
    throw new Error("conversationId is required");
  }

  const existing = await findByConversationId(conversationId);
  if (existing?.status === "sent") {
    return { queued: false, duplicate: true, alreadySent: true, item: existing };
  }

  const { item, created, duplicate } = await enqueuePending({ conversationId, agentId });
  return { queued: created || item.status === "pending", created, duplicate, item };
}

export async function processPendingIfAny() {
  const pending = await listPending();
  if (pending.length === 0) {
    return { processed: 0, results: [] };
  }
  return processPendingConversations();
}

export function startPendingProcessor() {
  const pollMs = Number(process.env.ELEVENLABS_FALLBACK_POLL_MS || 60000);

  setInterval(() => {
    void processPendingIfAny().catch((err) => {
      console.error("[elevenlabs-fallback] periodic process error:", err.message);
    });
  }, pollMs);

  console.log(
    `[elevenlabs-fallback] pending processor started (every ${pollMs}ms)`,
  );
}

export async function processPendingConversations() {
  const pending = await listPending();
  const results = [];

  for (const item of pending) {
    const { conversationId } = item;

    try {
      await incrementAttempt(conversationId);
      const fetchResult = await fetchUntilDone(conversationId);

      if (!fetchResult.ok) {
        const maxAttempts = getMaxAttempts();
        const updated = await findByConversationId(conversationId);

        if ((updated?.attempts ?? 0) >= maxAttempts) {
          await markFailed(conversationId, fetchResult.error);
        }

        results.push({
          conversationId,
          status: "pending",
          error: fetchResult.error,
          attempts: fetchResult.attempts,
        });
        continue;
      }

      const webhookShape = wrapApiResponseToWebhookShape(fetchResult.apiResponse);
      await sendTranscriptEmail(webhookShape);
      await markSent(conversationId);

      results.push({
        conversationId,
        status: "sent",
        attempts: fetchResult.attempts,
      });
    } catch (err) {
      const updated = await incrementAttempt(conversationId, err.message);
      const maxAttempts = getMaxAttempts();

      if ((updated?.attempts ?? 0) >= maxAttempts) {
        await markFailed(conversationId, err.message);
        results.push({ conversationId, status: "failed", error: err.message });
      } else {
        results.push({ conversationId, status: "pending", error: err.message });
      }
    }
  }

  return { processed: results.length, results };
}
