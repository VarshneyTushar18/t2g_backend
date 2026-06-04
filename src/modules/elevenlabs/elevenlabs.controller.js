import { transporter } from "../../utils/email.service.js";
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
    console.warn(`[elevenlabs] ${verification.message}`);
    return res.status(verification.status).send(verification.message);
  }

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
  const from =
    process.env.ELEVENLABS_FROM_EMAIL ||
    process.env.SMTP_EMAIL ||
    "no-reply@tech2globe.com";

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
  }

  return res.status(200).send("Processed");
};
