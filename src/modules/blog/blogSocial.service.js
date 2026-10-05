import * as model from "./blogSocial.model.js";
import { resolveSeoForOutput } from "./blogSeo.js";
import {
  BLOG_SOCIAL_PLATFORMS,
  getPlatform,
  normalizeSocialShareInput,
  parseSocialShareFromRow,
} from "./blogSocial.platforms.js";

export { parseSocialShareFromRow };

const SITE_URL = (process.env.SITE_URL || "https://www.tech2globe.com").replace(/\/$/, "");

function buildPostUrl(post) {
  const seo = resolveSeoForOutput(post, post.seo || {});
  if (seo.canonical_url) return seo.canonical_url;
  if (post.slug) return `${SITE_URL}/blogs/${post.slug}`;
  return SITE_URL;
}

export function buildSharePayload(post, platformId, shareConfig = {}) {
  const platform = getPlatform(platformId);
  const seo = resolveSeoForOutput(post, post.seo || {});
  const url = buildPostUrl(post);
  const title = seo.og_title || seo.meta_title || post.title || "";
  const description =
    shareConfig.message ||
    seo.twitter_description ||
    seo.og_description ||
    seo.meta_description ||
    post.excerpt ||
    "";
  const image = seo.twitter_image || seo.og_image || post.featured_image || "";

  let text = shareConfig.message || `${title}\n\n${description}`.trim();
  if (!shareConfig.message && url) {
    text = `${text}\n\n${url}`.trim();
  }
  if (platform?.maxLength && text.length > platform.maxLength) {
    text = `${text.slice(0, platform.maxLength - 1)}…`;
  }

  return { platformId, title, description, url, image, text };
}

async function postToPlatform(platformId, payload, account) {
  if (!account?.is_active) {
    const err = new Error(`${platformId} account is not connected`);
    err.code = "NOT_CONNECTED";
    throw err;
  }

  // Platform API adapters — wire OAuth + official APIs here.
  const envMap = {
    x: ["TWITTER_API_KEY", "X_API_KEY"],
    facebook: ["META_PAGE_ACCESS_TOKEN", "FACEBOOK_PAGE_ACCESS_TOKEN"],
    linkedin: ["LINKEDIN_ACCESS_TOKEN"],
    instagram: ["META_PAGE_ACCESS_TOKEN", "INSTAGRAM_ACCESS_TOKEN"],
  };
  const keys = envMap[platformId] || [];
  const configured = keys.some((k) => Boolean(process.env[k]?.trim()));
  if (!configured) {
    const err = new Error(
      `${getPlatform(platformId)?.label || platformId} API is not configured on the server yet`,
    );
    err.code = "API_NOT_CONFIGURED";
    throw err;
  }

  const err = new Error(
    `${getPlatform(platformId)?.label || platformId} posting adapter not implemented yet — credentials detected`,
  );
  err.code = "ADAPTER_PENDING";
  throw err;
}

export async function getPlatformsStatus() {
  const accounts = await model.listAccounts();
  const byPlatform = Object.fromEntries(accounts.map((a) => [a.platform, a]));
  return BLOG_SOCIAL_PLATFORMS.map((platform) => {
    const account = byPlatform[platform.id];
    return {
      ...platform,
      connected: Boolean(account?.is_active),
      account_label: account?.account_label || null,
      account_id: account?.account_id || null,
      connected_at: account?.connected_at || null,
    };
  });
}

export async function sharePostOnPublish(post, socialShareRaw, { force = false } = {}) {
  const socialShare = normalizeSocialShareInput(socialShareRaw);
  const results = [];

  for (const platform of BLOG_SOCIAL_PLATFORMS) {
    const cfg = socialShare[platform.id];
    if (!cfg?.enabled) continue;

    const existing = (await model.listSharesForPost(post.id))[platform.id];
    if (existing?.status === "success" && !force) {
      results.push({ platform: platform.id, status: "skipped", reason: "already_shared" });
      continue;
    }

    if (platform.requiresImage && !post.featured_image && !post.seo?.og_image) {
      await model.upsertShare(post.id, platform.id, {
        status: "failed",
        error_message: "Featured or OG image required for Instagram",
      });
      results.push({ platform: platform.id, status: "failed", error: "image_required" });
      continue;
    }

    const account = await model.getAccount(platform.id);
    const payload = buildSharePayload(post, platform.id, cfg);

    try {
      const external = await postToPlatform(platform.id, payload, account);
      await model.upsertShare(post.id, platform.id, {
        status: "success",
        external_id: external?.id || null,
      });
      results.push({ platform: platform.id, status: "success" });
    } catch (err) {
      await model.upsertShare(post.id, platform.id, {
        status: "failed",
        error_message: err.message,
      });
      results.push({ platform: platform.id, status: "failed", error: err.message });
    }
  }

  return results;
}

export async function getPostSocialSummary(postId) {
  const shares = await model.listSharesForPost(postId);
  const platforms = await getPlatformsStatus();
  return { platforms, shares };
}

export async function markAccountConnected(platform, { account_label, account_id } = {}) {
  if (!getPlatform(platform)) {
    const err = new Error("Unknown platform");
    err.status = 400;
    throw err;
  }
  return model.upsertAccount(platform, {
    account_label,
    account_id,
    is_active: true,
  });
}
