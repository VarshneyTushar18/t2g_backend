/**
 * End-to-end test: signed webhook POST + direct SMTP to transcript recipient.
 * Run on VPS: node scripts/test-elevenlabs-email.mjs
 */
import crypto from "crypto";
import dotenv from "dotenv";
import { transporter, getSmtpFromAddress } from "../src/utils/email.service.js";
import {
  buildTranscriptEmailHtml,
  buildTranscriptSubject,
  parseTranscriptPayload,
} from "../src/modules/elevenlabs/elevenlabs.service.js";

dotenv.config();

const secret = process.env.ELEVENLABS_SECRET?.trim();
const to =
  process.env.ELEVENLABS_TRANSCRIPT_EMAIL ||
  process.env.OWNER_EMAILS?.split(",")[0]?.trim() ||
  "harpreet@tech2globe.com";
const from = getSmtpFromAddress();
const port = process.env.PORT || 5000;
const baseUrl = process.env.TEST_WEBHOOK_URL || `http://127.0.0.1:${port}`;

console.log("=== ElevenLabs email diagnostic ===\n");
console.log("ELEVENLABS_SECRET:", secret ? `(set, ${secret.length} chars)` : "MISSING");
console.log("ELEVENLABS_TRANSCRIPT_EMAIL:", to);
console.log("SMTP from:", from || "MISSING");
console.log("Webhook URL:", `${baseUrl}/api/elevenlabs/webhook`);
console.log("");

if (!secret) {
  console.error("FAIL: Set ELEVENLABS_SECRET in .env (from the api/elevenlabs/webhook endpoint).");
  process.exit(1);
}

// 1) SMTP verify + direct mail to transcript recipient
console.log("1) Testing SMTP to transcript recipient...");
try {
  await transporter.verify();
  console.log("   SMTP connection: OK");
  await transporter.sendMail({
    from: `"Chat Support Test" <${from}>`,
    to,
    subject: "[TEST] ElevenLabs SMTP direct — ignore if received",
    text: "If you get this, SMTP can reach the transcript inbox. Time: " + new Date().toISOString(),
  });
  console.log(`   Direct email sent to ${to}: OK`);
} catch (err) {
  console.error(`   FAIL SMTP: ${err.message}`);
  console.error("   Fix SMTP_EMAIL / SMTP_PASSWORD before testing webhook.");
  process.exit(1);
}

// 2) Signed webhook POST (same as ElevenLabs)
console.log("\n2) Testing signed webhook POST...");
const payload = {
  type: "post_call_transcription",
  event_timestamp: Math.floor(Date.now() / 1000),
  data: {
    conversation_id: `test_${Date.now()}`,
    transcript: [
      { role: "user", message: "Test message from diagnostic script", time_in_call_secs: 0 },
      { role: "agent", message: "Test agent reply", time_in_call_secs: 5 },
    ],
  },
};
const raw = JSON.stringify(payload);
const ts = Math.floor(Date.now() / 1000);
const sig = crypto.createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
const signatureHeader = `t=${ts},v0=${sig}`;

const res = await fetch(`${baseUrl}/api/elevenlabs/webhook`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "ElevenLabs-Signature": signatureHeader,
  },
  body: raw,
});
const text = await res.text();
console.log(`   HTTP ${res.status}: ${text}`);

if (res.status === 200) {
  console.log(`\nSUCCESS: Check inbox ${to} for transcript email (subject: Chat Transcript).`);
  console.log("If direct test arrived but transcript email did not, check pm2 logs.");
} else if (res.status === 401) {
  console.error("\nFAIL: Invalid signature — ELEVENLABS_SECRET does not match ElevenLabs webhook secret.");
} else {
  console.error("\nFAIL: Webhook handler returned an error. Run: pm2 logs t2g_backend --lines 20");
}
