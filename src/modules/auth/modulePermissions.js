import { ADMIN_MODULES } from "./auth.constants.js";

export const PERMISSION_ACTIONS = ["view", "add", "edit", "delete"];

const FULL = { view: true, add: true, edit: true, delete: true };
const VIEW_ONLY = { view: true, add: false, edit: false, delete: false };

/** Default when a module is enabled without explicit flags */
export const defaultFullPermissions = () => ({ ...FULL });

export const defaultViewOnlyPermissions = () => ({ ...VIEW_ONLY });

export const normalizeModuleEntry = (entry) => {
  if (typeof entry === "string") {
    if (!ADMIN_MODULES.includes(entry)) return null;
    return { key: entry, ...defaultFullPermissions() };
  }
  if (!entry || typeof entry !== "object") return null;
  const key = entry.key || entry.module;
  if (!key || !ADMIN_MODULES.includes(key)) return null;
  const view = Boolean(entry.view);
  const write = Boolean(entry.add) || Boolean(entry.edit);
  const del = Boolean(entry.delete);
  if (!view && !write && !del) return null;
  return {
    key,
    view: view || write || del,
    add: write,
    edit: write,
    delete: del,
  };
};

export const normalizeModuleList = (input) => {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const row = normalizeModuleEntry(item);
    if (!row || seen.has(row.key)) continue;
    seen.add(row.key);
    out.push(row);
  }
  return out;
};

export const moduleKeysFromList = (list) =>
  normalizeModuleList(list).map((m) => m.key);

export const permissionsMapFromList = (list) => {
  const map = {};
  for (const row of normalizeModuleList(list)) {
    map[row.key] = {
      view: row.view,
      add: row.add,
      edit: row.edit,
      delete: row.delete,
    };
  }
  return map;
};

export const canPerform = (permissions, moduleKey, action) => {
  if (!permissions || !moduleKey) return false;
  const p = permissions[moduleKey];
  if (!p) return false;
  if (action === "view") return Boolean(p.view);
  if (action === "add") return Boolean(p.add);
  if (action === "edit") return Boolean(p.edit);
  if (action === "delete") return Boolean(p.delete);
  return false;
};

export const httpMethodToAction = (method) => {
  const m = (method || "GET").toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return "view";
  if (m === "POST") return "add";
  if (m === "PUT" || m === "PATCH") return "edit";
  if (m === "DELETE") return "delete";
  return "view";
};
