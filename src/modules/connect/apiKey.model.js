import crypto from "crypto";
import pool from "../../config/db.js";
import { ADMIN_MODULES } from "../auth/auth.constants.js";
import {
  moduleKeysFromList,
  normalizeModuleList,
  permissionsMapFromList,
} from "../auth/modulePermissions.js";

export const generateRawKey = () => {
  const random = crypto.randomBytes(24).toString("hex");
  return `t2g_sk_${random}`;
};

export const hashKey = (rawKey) =>
  crypto.createHash("sha256").update(rawKey).digest("hex");

export const keyPrefix = (rawKey) => rawKey.slice(0, 16);

const parseJson = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const buildKeyPermissions = (modules, readOnly) => {
  const list = normalizeModuleList(
    modules.map((key) =>
      readOnly
        ? { key, view: true, add: false, edit: false, delete: false }
        : { key, view: true, add: true, edit: true, delete: true },
    ),
  );
  return {
    modules: moduleKeysFromList(list),
    permissions: permissionsMapFromList(list),
  };
};

export const findActiveKeyByRaw = async (rawKey) => {
  if (!rawKey?.startsWith("t2g_sk_")) return null;
  const keyHash = hashKey(rawKey);
  const [rows] = await pool.query(
    `SELECT id, name, modules, read_only, is_active
     FROM admin_api_keys
     WHERE key_hash = ? AND is_active = 1 AND revoked_at IS NULL
     LIMIT 1`,
    [keyHash],
  );
  return rows[0] || null;
};

export const touchLastUsed = async (id) => {
  await pool.query(`UPDATE admin_api_keys SET last_used_at = NOW() WHERE id = ?`, [
    id,
  ]);
};

export const listApiKeys = async () => {
  const [rows] = await pool.query(
    `SELECT id, name, key_prefix, modules, read_only, created_by, last_used_at, created_at, is_active
     FROM admin_api_keys
     WHERE revoked_at IS NULL
     ORDER BY created_at DESC`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    key_prefix: row.key_prefix,
    modules: parseJson(row.modules, []),
    read_only: row.read_only === 1 || row.read_only === true,
    created_by: row.created_by,
    last_used_at: row.last_used_at,
    created_at: row.created_at,
    is_active: row.is_active === 1 || row.is_active === true,
  }));
};

export const createApiKey = async ({ name, modules, readOnly = true, createdBy }) => {
  const validModules = moduleKeysFromList(normalizeModuleList(modules));
  const filtered = validModules.filter((m) => ADMIN_MODULES.includes(m));
  if (filtered.length === 0) {
    throw new Error("Select at least one valid module");
  }

  const rawKey = generateRawKey();
  const prefix = keyPrefix(rawKey);
  const keyHash = hashKey(rawKey);

  const [result] = await pool.query(
    `INSERT INTO admin_api_keys (name, key_prefix, key_hash, modules, read_only, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name.trim(), prefix, keyHash, JSON.stringify(filtered), readOnly ? 1 : 0, createdBy || null],
  );

  return {
    id: result.insertId,
    name: name.trim(),
    key: rawKey,
    key_prefix: prefix,
    modules: filtered,
    read_only: readOnly,
  };
};

export const revokeApiKey = async (id) => {
  const [result] = await pool.query(
    `UPDATE admin_api_keys SET is_active = 0, revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL`,
    [id],
  );
  return result.affectedRows > 0;
};
