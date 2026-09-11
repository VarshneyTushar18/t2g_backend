import axios from "axios";

export const LEAD_EMAILS = ["info@tech2globe.com", "enquiries@tech2globe.net"];

export const sanitize = (value) => (value ? String(value).trim() : null);

export const validateEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const verifyTurnstile = async (
  captchaToken,
  ip,
  secret = process.env.TURNSTILE_SECRET_KEY,
) => {
  if (!captchaToken) {
    return { ok: false, message: "Captcha required" };
  }

  if (!secret) {
    return { ok: false, message: "Captcha not configured" };
  }

  const verifyResponse = await axios.post(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    new URLSearchParams({
      secret,
      response: captchaToken,
      remoteip: ip,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );

  if (!verifyResponse.data.success) {
    const codes = verifyResponse.data["error-codes"] || [];
    if (codes.length) {
      console.error("Turnstile verify failed:", codes.join(", "));
    }
    const message =
      codes.includes("invalid-input-secret")
        ? "Captcha secret misconfigured on server"
        : codes.includes("timeout-or-duplicate")
          ? "Captcha expired — please verify again"
          : codes.includes("invalid-input-response")
            ? "Captcha invalid — please verify again"
            : "Captcha verification failed";
    return { ok: false, message, codes };
  }

  return { ok: true };
};

export const getClientIp = (req) =>
  req.headers["cf-connecting-ip"] ||
  req.headers["x-forwarded-for"]?.split(",")[0] ||
  req.socket.remoteAddress ||
  req.ip;

export const csvEscape = (value) => {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};
