import { OpenAI } from "openai";
import {
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
} from "@openai/agents";

let ready = false;

export function initOpenAI() {
  if (ready) return;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY in environment");
  }

  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer":
        process.env.OPENROUTER_SITE_URL || "https://manageadmin.tech2globe.tech",
      "X-Title": process.env.OPENROUTER_SITE_NAME || "Tech2Globe Blog Agent",
    },
  });

  setDefaultOpenAIClient(client);
  setOpenAIAPI("chat_completions");
  setTracingDisabled(true);
  ready = true;
}

export const DEFAULT_MODEL =
  process.env.AGENT_MODEL || "openai/gpt-4o-mini";

export function isAgentConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}
