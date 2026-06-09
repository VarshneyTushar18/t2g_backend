import fs from "node:fs/promises";
import path from "node:path";

const STORE_PATH = path.resolve(
  process.cwd(),
  "data",
  "elevenlabs-pending.json",
);

const EMPTY_STORE = { items: [] };

async function ensureStore() {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, JSON.stringify(EMPTY_STORE, null, 2), "utf8");
  }
}

async function readStore() {
  await ensureStore();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.items)) return { ...EMPTY_STORE };
    return parsed;
  } catch {
    return { ...EMPTY_STORE };
  }
}

async function writeStore(store) {
  await ensureStore();
  const tmp = `${STORE_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tmp, STORE_PATH);
}

export async function findByConversationId(conversationId) {
  const store = await readStore();
  return store.items.find((item) => item.conversationId === conversationId) ?? null;
}

export async function enqueuePending({ conversationId, agentId }) {
  const store = await readStore();
  const existing = store.items.find((item) => item.conversationId === conversationId);

  if (existing) {
    if (existing.status === "sent") {
      return { item: existing, created: false, duplicate: true };
    }
    return { item: existing, created: false, duplicate: false };
  }

  const item = {
    conversationId,
    agentId: agentId || process.env.ELEVENLABS_AGENT_ID || null,
    notifiedAt: new Date().toISOString(),
    attempts: 0,
    status: "pending",
    lastAttemptAt: null,
    error: null,
  };

  store.items.push(item);
  await writeStore(store);
  return { item, created: true, duplicate: false };
}

export async function listPending() {
  const store = await readStore();
  return store.items.filter((item) => item.status === "pending");
}

export async function updateItem(conversationId, patch) {
  const store = await readStore();
  const index = store.items.findIndex((item) => item.conversationId === conversationId);
  if (index === -1) return null;

  store.items[index] = { ...store.items[index], ...patch };
  await writeStore(store);
  return store.items[index];
}

export async function markSent(conversationId) {
  return updateItem(conversationId, {
    status: "sent",
    error: null,
    sentAt: new Date().toISOString(),
  });
}

export async function markFailed(conversationId, error) {
  return updateItem(conversationId, {
    status: "failed",
    error: String(error ?? "Unknown error"),
    failedAt: new Date().toISOString(),
  });
}

export async function incrementAttempt(conversationId, error = null) {
  const store = await readStore();
  const index = store.items.findIndex((item) => item.conversationId === conversationId);
  if (index === -1) return null;

  const item = store.items[index];
  store.items[index] = {
    ...item,
    attempts: (item.attempts ?? 0) + 1,
    lastAttemptAt: new Date().toISOString(),
    ...(error ? { error: String(error) } : {}),
  };
  await writeStore(store);
  return store.items[index];
}
