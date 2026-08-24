import { Readable } from "node:stream";
import cloudinary from "../../../config/cloudinary.js";

const FOLDER = "tech2globe/blog-agent";

export const IMAGE_MODEL =
  process.env.IMAGE_AGENT_MODEL || "google/gemini-2.5-flash-image-preview";

function openRouterHeaders() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    const err = new Error("Missing OPENROUTER_API_KEY");
    err.status = 503;
    throw err;
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer":
      process.env.OPENROUTER_SITE_URL || "https://manageadmin.tech2globe.tech",
    "X-Title": process.env.OPENROUTER_SITE_NAME || "Tech2Globe Blog Image Agent",
  };
}

function extractImageDataUrl(payload) {
  const message = payload?.choices?.[0]?.message;
  if (!message) return null;

  const fromImages = message.images?.[0]?.image_url?.url || message.images?.[0]?.url;
  if (fromImages) return fromImages;

  const content = message.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      const url =
        part?.image_url?.url ||
        part?.imageUrl?.url ||
        (part?.type === "image_url" && (part.url || part.image_url));
      if (url) return url;
    }
  }
  if (typeof content === "string") {
    const match = content.match(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/);
    if (match) return match[0];
    const http = content.match(/https?:\/\/\S+\.(png|jpe?g|webp)/i);
    if (http) return http[0];
  }
  return null;
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl).match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (match) {
    return { buffer: Buffer.from(match[2], "base64"), mime: match[1] };
  }
  return null;
}

function uploadBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: FOLDER,
        resource_type: "image",
        format: "jpg",
        transformation: [
          { width: 1600, height: 900, crop: "fill", gravity: "auto", quality: "auto" },
        ],
      },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    Readable.from(buffer).pipe(stream);
  });
}

async function uploadRemoteUrl(url) {
  return cloudinary.uploader.upload(url, {
    folder: FOLDER,
    resource_type: "image",
    format: "jpg",
    transformation: [
      { width: 1600, height: 900, crop: "fill", gravity: "auto", quality: "auto" },
    ],
  });
}

export function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

/**
 * Generate an image via OpenRouter, then upload to Cloudinary.
 * Returns { url, public_id, width, height, prompt, model }.
 */
export async function generateAndUploadBlogImage({ prompt, aspect = "16:9" }) {
  const fullPrompt = [
    "Professional blog featured image for Tech2Globe (IT, ecommerce, Amazon, digital marketing).",
    "Photorealistic or clean modern illustration. No watermarks, no logos, no readable text.",
    `Aspect ${aspect}.`,
    `Scene: ${String(prompt || "").trim()}`,
  ].join(" ");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: openRouterHeaders(),
    body: JSON.stringify({
      model: IMAGE_MODEL,
      messages: [{ role: "user", content: fullPrompt }],
      modalities: ["image", "text"],
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      payload?.error?.message ||
      payload?.error ||
      `Image generation failed (${res.status})`;
    const err = new Error(String(msg));
    err.status = res.status >= 400 && res.status < 500 ? res.status : 502;
    throw err;
  }

  const raw = extractImageDataUrl(payload);
  if (!raw) {
    const err = new Error(
      "Image model returned no image. Check IMAGE_AGENT_MODEL on the server (needs an image-capable OpenRouter model).",
    );
    err.status = 502;
    throw err;
  }

  if (!isCloudinaryConfigured()) {
    const err = new Error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.",
    );
    err.status = 503;
    throw err;
  }

  let uploaded;
  const parsed = dataUrlToBuffer(raw);
  if (parsed) {
    uploaded = await uploadBuffer(parsed.buffer);
  } else if (/^https?:\/\//i.test(raw)) {
    uploaded = await uploadRemoteUrl(raw);
  } else {
    const err = new Error("Unsupported image payload from the model");
    err.status = 502;
    throw err;
  }

  return {
    url: uploaded.secure_url,
    public_id: uploaded.public_id,
    width: uploaded.width,
    height: uploaded.height,
    prompt: String(prompt || "").trim(),
    model: IMAGE_MODEL,
  };
}
