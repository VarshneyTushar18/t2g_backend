import { transporter, getSmtpFromAddress } from "../../utils/email.service.js";
import {
  verifyElevenLabsSignature,
  parseTranscriptPayload,
  buildTranscriptEmailHtml,
  buildTranscriptSubject,
} from "./elevenlabs.service.js";

export const handleTranscriptWebhook = async (req, res) => {
  const rawBody = req.body;
  const raw =
    Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody ?? "");

  const signatureHeader = req.get("ElevenLabs-Signature") || "";
  const secret = process.env.ELEVENLABS_SECRET;

  console.log(
    `[elevenlabs] webhook received, signature: ${signatureHeader ? "present" : "missing"}`,
  );

  const verification = verifyElevenLabsSignature(raw, signatureHeader, secret);
  if (!verification.ok) {
    console.warn(
      `[elevenlabs] rejected: ${verification.message} (body ${raw.length} bytes)`,
    );
    return res.status(verification.status).send(verification.message);
  }

  console.log("[elevenlabs] signature verified OK");

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    console.warn("[elevenlabs] invalid JSON payload");
    return res.status(400).send("Invalid JSON payload");
  }

  const { eventTs, conversationId, formatted } = parseTranscriptPayload(data);
  const to =
    process.env.ELEVENLABS_TRANSCRIPT_EMAIL ||
    process.env.OWNER_EMAILS?.split(",")[0]?.trim() ||
    "harpreet@tech2globe.com";
  const from = getSmtpFromAddress();
  if (!from) {
    console.error("[elevenlabs] no SMTP from address (set SMTP_EMAIL or EMAIL_USER)");
    return res.status(500).send("Email sender not configured");
  }

  const html = buildTranscriptEmailHtml({ conversationId, eventTs, formatted });
  const subject = buildTranscriptSubject(conversationId, eventTs);

  try {
    await transporter.sendMail({
      from: `"Chat Support" <${from}>`,
      to,
      subject,
      html,
    });
    console.log(
      `[elevenlabs] email sent to ${to} (conversation ${conversationId}, messages: ${formatted.length})`,
    );
  } catch (err) {
    console.error("[elevenlabs] email failed:", err.message);
    return res.status(500).send("Email delivery failed");
  }

  return res.status(200).send("Processed");
};
