import axios from "axios";

const BASE_URL = "https://api.elevenlabs.io/v1/convai/conversations";

function getApiKey() {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }
  return key;
}

function apiHeaders() {
  return { "xi-api-key": getApiKey() };
}

export async function fetchConversation(conversationId) {
  const { data } = await axios.get(`${BASE_URL}/${encodeURIComponent(conversationId)}`, {
    headers: apiHeaders(),
    timeout: 30000,
  });
  return data;
}

export async function listRecentConversations({ agentId, pageSize = 20, cursor = null } = {}) {
  const params = { page_size: pageSize };
  if (agentId) params.agent_id = agentId;
  if (cursor) params.cursor = cursor;

  const { data } = await axios.get(BASE_URL, {
    headers: apiHeaders(),
    params,
    timeout: 30000,
  });
  return data;
}
