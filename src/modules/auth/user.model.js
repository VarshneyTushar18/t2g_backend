import bcrypt from "bcryptjs";
import pool from "../../config/db.js";
import { ADMIN_MODULES, ROLE_MODULES, SUPER_ADMIN_ROLE } from "./auth.constants.js";
import {
  moduleKeysFromList,
  normalizeModuleList,
  permissionsMapFromList,
} from "./modulePermissions.js";

export const findUserByEmail = async (email) => {
  const [rows] = await pool.query(
    `SELECT id, email, password_hash, role, is_active FROM admin_users WHERE email = ? LIMIT 1`,
    [email.toLowerCase().trim()],
  );
  return rows[0] || null;
};

export const findUserById = async (id) => {
  const [rows] = await pool.query(
    `SELECT id, email, role, is_active, created_at FROM admin_users WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
};

/** Role label for DB enum only — does NOT control which modules the user sees */
export const inferRoleFromModules = (moduleKeys) => {
  const valid = moduleKeys.filter((m) => ADMIN_MODULES.includes(m));
  const hasCareer = valid.includes("career");
  const hasMarketing = valid.some((m) =>
    ["portfolio", "testimonials", "case_studies", "blog"].includes(m),
  );
  if (hasMarketing && !hasCareer) return "digital_marketing";
  if (hasCareer && !hasMarketing) return "hr";
  if (hasCareer && hasMarketing) return "hr";
  if (hasMarketing) return "digital_marketing";
  return "hr";
};

export const getUserModules = async (userId) => {
  const [rows] = await pool.query(
    `SELECT module_key FROM admin_user_modules WHERE user_id = ?`,
    [userId],
  );
  return rows.map((r) => r.module_key);
};

/** Exact modules + permissions super admin assigned (JSON on admin_users) */
export const readGrantedModules = async (userId) => {
  try {
    const [rows] = await pool.query(
      `SELECT granted_modules FROM admin_users WHERE id = ? LIMIT 1`,
      [userId],
    );
    if (!rows[0] || rows[0].granted_modules == null) {
      return null;
    }
    const raw = rows[0].granted_modules;
    const list = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(list)) return [];
    return normalizeModuleList(list);
  } catch (err) {
    if (err.code === "ER_BAD_FIELD_ERROR") return null;
    throw err;
  }
};

export const saveGrantedModules = async (userId, moduleInput) => {
  const valid = normalizeModuleList(moduleInput);
  try {
    await pool.query(`UPDATE admin_users SET granted_modules = ? WHERE id = ?`, [
      JSON.stringify(valid),
      userId,
    ]);
    return valid;
  } catch (err) {
    if (err.code === "ER_BAD_FIELD_ERROR") return valid;
    throw err;
  }
};

export const getEffectiveModules = async (user) => {
  if (user.role === SUPER_ADMIN_ROLE) {
    return [...ADMIN_MODULES];
  }

  try {
    const fromTable = await getUserModules(user.id);
    if (fromTable.length > 0) return fromTable;
  } catch (err) {
    if (err.code !== "ER_NO_SUCH_TABLE") throw err;
  }

  const granted = await readGrantedModules(user.id);
  if (granted !== null && granted.length > 0) {
    return moduleKeysFromList(granted);
  }

  return [...(ROLE_MODULES[user.role] || [])];
};

export const getEffectivePermissions = async (user) => {
  if (user.role === SUPER_ADMIN_ROLE) {
    return permissionsMapFromList(ADMIN_MODULES.map((key) => ({ key, view: true, add: true, edit: true, delete: true })));
  }

  try {
    const fromTable = await getUserModules(user.id);
    if (fromTable.length > 0) {
      return permissionsMapFromList(fromTable.map((key) => ({ key, view: true, add: true, edit: true, delete: true })));
    }
  } catch (err) {
    if (err.code !== "ER_NO_SUCH_TABLE") throw err;
  }

  const granted = await readGrantedModules(user.id);
  if (granted !== null && granted.length > 0) {
    return permissionsMapFromList(granted);
  }

  const fallback = ROLE_MODULES[user.role] || [];
  return permissionsMapFromList(
    fallback.map((key) => ({ key, view: true, add: true, edit: true, delete: true })),
  );
};

export const updatePassword = async (userId, plainPassword) => {
  const password_hash = await bcrypt.hash(plainPassword, 12);
  await pool.query(`UPDATE admin_users SET password_hash = ? WHERE id = ?`, [
    password_hash,
    userId,
  ]);
};

export const listStaffUsers = async () => {
  const [users] = await pool.query(
    `SELECT id, email, role, is_active, created_at FROM admin_users ORDER BY created_at DESC`,
  );
  return Promise.all(
    users.map(async (u) => {
      const modules = await getEffectiveModules(u);
      const permissions = await getEffectivePermissions(u);
      const granted = await readGrantedModules(u.id);
      return {
        id: u.id,
        email: u.email,
        role: u.role,
        modules,
        permissions,
        moduleAccess: granted ?? modules.map((key) => ({ key, view: true, add: true, edit: true, delete: true })),
        is_active: u.is_active,
        created_at: u.created_at,
      };
    }),
  );
};

const resolveModuleInput = (moduleKeys, moduleAccess) => {
  if (Array.isArray(moduleAccess) && moduleAccess.length > 0) {
    return normalizeModuleList(moduleAccess);
  }
  return normalizeModuleList(moduleKeys);
};

export const createStaffUser = async (
  email,
  plainPassword,
  moduleKeys = [],
  fullName = null,
  moduleAccess = null,
) => {
  const valid = resolveModuleInput(moduleKeys, moduleAccess);
  const keys = moduleKeysFromList(valid);
  if (keys.length === 0) {
    throw new Error("Select at least one module");
  }

  const role = inferRoleFromModules(keys);
  const password_hash = await bcrypt.hash(plainPassword, 12);
  const name = fullName || email.split("@")[0];

  const [result] = await pool.query(
    `INSERT INTO admin_users (email, password_hash, role, full_name, granted_modules) VALUES (?, ?, ?, ?, ?)`,
    [
      email.toLowerCase().trim(),
      password_hash,
      role,
      name,
      JSON.stringify(valid),
    ],
  ).catch(async (err) => {
    if (err.code !== "ER_BAD_FIELD_ERROR") throw err;
    const [r] = await pool.query(
      `INSERT INTO admin_users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)`,
      [email.toLowerCase().trim(), password_hash, role, name],
    );
    return r;
  });

  const userId = result.insertId;
  await saveGrantedModules(userId, valid);
  await setUserModules(userId, keys, valid);
  return findUserById(userId);
};

export const setUserModules = async (userId, moduleKeys, moduleAccess = null) => {
  const valid = resolveModuleInput(moduleKeys, moduleAccess);
  const keys = moduleKeysFromList(valid);
  const role = inferRoleFromModules(keys.length ? keys : ["career"]);

  await saveGrantedModules(userId, valid);

  try {
    await pool.query(`DELETE FROM admin_user_modules WHERE user_id = ?`, [userId]);
    if (keys.length > 0) {
      const values = keys.map((m) => [userId, m]);
      await pool.query(
        `INSERT INTO admin_user_modules (user_id, module_key) VALUES ?`,
        [values],
      );
    }
  } catch (err) {
    if (err.code !== "ER_NO_SUCH_TABLE") throw err;
  }

  await pool.query(`UPDATE admin_users SET role = ? WHERE id = ? AND role != ?`, [
    role,
    userId,
    SUPER_ADMIN_ROLE,
  ]);
};

export const setUserActive = async (userId, isActive) => {
  await pool.query(`UPDATE admin_users SET is_active = ? WHERE id = ?`, [
    isActive ? 1 : 0,
    userId,
  ]);
};

export const deleteStaffUser = async (userId) => {
  const user = await findUserById(userId);
  if (!user || user.role === SUPER_ADMIN_ROLE) {
    return { deleted: false, reason: "Cannot delete super admin" };
  }
  await pool.query(`DELETE FROM admin_users WHERE id = ?`, [userId]);
  return { deleted: true };
};

export const buildAuthPayload = async (user) => {
  const modules = await getEffectiveModules(user);
  const permissions = await getEffectivePermissions(user);
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    modules,
    permissions,
  };
};
