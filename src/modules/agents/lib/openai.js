import { OpenAI } from "openai";
import {
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
} from "@openai/agents";
import { getRuntimeConfig } from "../ai-integrations/aiIntegrations.model.js";

let ready = false;
let cachedModel = process.env.AGENT_MODEL || "openai/gpt-4o-mini";
let cachedImageModel = process.env.IMAGE_AGENT_MODEL || "";
let configured = Boolean(
  process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
);

export function resetAgentClient() {
  ready = false;
}

export async function initOpenAI() {
  if (ready) return;

  const config = await getRuntimeConfig();
  if (!config.apiKey) {
    configured = false;
    throw new Error(
      "AI is not configured. Set API key in Admin → Connect → AI Integrations (or OPENROUTER_API_KEY in .env).",
    );
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    defaultHeaders: {
      "HTTP-Referer": config.siteUrl,
      "X-Title": config.siteName,
    },
  });

  setDefaultOpenAIClient(client);
  setOpenAIAPI("chat_completions");
  setTracingDisabled(true);

  cachedModel = config.defaultModel;
  cachedImageModel = config.imageModel || "";
  configured = true;
  ready = true;
}

export function getDefaultModel() {
  return cachedModel || process.env.AGENT_MODEL || "openai/gpt-4o-mini";
}

export function getImageModel() {
  return cachedImageModel || process.env.IMAGE_AGENT_MODEL || getDefaultModel();
}

/** @deprecated use getDefaultModel() after initOpenAI() */
export const DEFAULT_MODEL =
  process.env.AGENT_MODEL || "openai/gpt-4o-mini";

export function isAgentConfigured() {
  return configured || Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY);
}

export async function refreshConfiguredFlag() {
  try {
    const config = await getRuntimeConfig();
    configured = config.configured;
    cachedModel = config.defaultModel;
    cachedImageModel = config.imageModel || "";
    return configured;
  } catch {
    configured = Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY);
    return configured;
  }
}
