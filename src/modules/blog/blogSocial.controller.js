import * as blogModel from "./blog.model.js";
import * as socialService from "./blogSocial.service.js";
import * as socialModel from "./blogSocial.model.js";
import { getPlatform } from "./blogSocial.platforms.js";

export async function getPlatforms(req, res) {
  try {
    const platforms = await socialService.getPlatformsStatus();
    res.json({ success: true, platforms });
  } catch (err) {
    console.error("blog social getPlatforms:", err);
    res.status(500).json({ error: err.message || "Failed to load social platforms" });
  }
}

export async function getPostSocial(req, res) {
  try {
    const postId = Number(req.params.postId);
    const post = await blogModel.getById(postId);
    if (!post) return res.status(404).json({ error: "Post not found" });
    const summary = await socialService.getPostSocialSummary(postId);
    res.json({
      success: true,
      social_share: post.social_share || {},
      ...summary,
    });
  } catch (err) {
    console.error("blog social getPostSocial:", err);
    res.status(500).json({ error: err.message || "Failed to load social status" });
  }
}

export async function connectAccount(req, res) {
  try {
    const platform = String(req.params.platform || "").trim();
    if (!getPlatform(platform)) {
      return res.status(400).json({ error: "Unknown platform" });
    }
    const account = await socialService.markAccountConnected(platform, {
      account_label: req.body?.account_label || null,
      account_id: req.body?.account_id || null,
    });
    res.json({
      success: true,
      message: `${getPlatform(platform).label} marked as connected. Add API keys on the server to enable posting.`,
      account: {
        platform: account.platform,
        account_label: account.account_label,
        account_id: account.account_id,
        is_active: Boolean(account.is_active),
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to connect account" });
  }
}

export async function disconnectAccount(req, res) {
  try {
    const platform = String(req.params.platform || "").trim();
    const account = await socialModel.getAccount(platform);
    if (!account) return res.status(404).json({ error: "Account not found" });
    await socialModel.upsertAccount(platform, { is_active: false });
    res.json({ success: true, message: "Disconnected" });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to disconnect" });
  }
}

export async function retryPostShare(req, res) {
  try {
    const postId = Number(req.params.postId);
    const post = await blogModel.getById(postId);
    if (!post) return res.status(404).json({ error: "Post not found" });
    if (post.status !== "publish") {
      return res.status(400).json({ error: "Post must be published before sharing to social" });
    }
    const results = await socialService.sharePostOnPublish(post, post.social_share, {
      force: true,
    });
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to retry social share" });
  }
}
