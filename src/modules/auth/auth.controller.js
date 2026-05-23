import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { cookieOptions } from "./auth.middleware.js";
import { ADMIN_MODULES, SUPER_ADMIN_ROLE } from "./auth.constants.js";
import {
  moduleKeysFromList,
  normalizeModuleList,
} from "./modulePermissions.js";
import * as UserModel from "./user.model.js";

const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "8h" });

const setAuthCookie = (res, token) => {
  res.cookie("token", token, cookieOptions);
};

export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    let user = null;
    try {
      user = await UserModel.findUserByEmail(normalizedEmail);
    } catch (err) {
      if (err.code !== "ER_NO_SUCH_TABLE") throw err;
    }

    let authUser;

    if (user) {
      if (!user.is_active) {
        return res.status(401).json({ message: "Account is deactivated" });
      }
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      authUser = await UserModel.buildAuthPayload(user);
    } else if (
      normalizedEmail === (process.env.ADMIN_EMAIL || "").toLowerCase().trim() &&
      password === process.env.ADMIN_PASSWORD
    ) {
      // Env super admin (no DB row) — until you add admin_users manually
      const full = ADMIN_MODULES.map((key) => ({
        key,
        view: true,
        add: true,
        edit: true,
        delete: true,
      }));
      authUser = {
        id: 0,
        email: normalizedEmail,
        role: SUPER_ADMIN_ROLE,
        modules: [...ADMIN_MODULES],
        permissions: Object.fromEntries(
          full.map((m) => [m.key, { view: true, add: true, edit: true, delete: true }]),
        ),
      };
    } else {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = signToken({
      sub: authUser.id,
      email: authUser.email,
      role: authUser.role,
      modules: authUser.modules,
      permissions: authUser.permissions || {},
    });

    setAuthCookie(res, token);
    res.json({ success: true, user: authUser });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const logoutAdmin = (req, res) => {
  res.clearCookie("token", cookieOptions);
  res.json({ success: true });
};

export const getMe = async (req, res) => {
  try {
    if (req.user.sub === 0) {
      const modules = req.user.modules || [...ADMIN_MODULES];
      const permissions =
        req.user.permissions ||
        Object.fromEntries(
          modules.map((key) => [
            key,
            { view: true, add: true, edit: true, delete: true },
          ]),
        );
      return res.json({
        success: true,
        user: {
          id: 0,
          email: req.user.email,
          role: req.user.role,
          modules,
          permissions,
        },
      });
    }

    const user = await UserModel.findUserById(req.user.sub);
    if (!user || !user.is_active) {
      return res.status(401).json({ message: "User not found or inactive" });
    }
    const authUser = await UserModel.buildAuthPayload(user);
    res.json({ success: true, user: authUser });
  } catch (err) {
    console.error("getMe error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const changeMyPassword = async (req, res) => {
  try {
    if (req.user.role !== SUPER_ADMIN_ROLE) {
      return res.status(403).json({
        message: "Only super admin can change passwords",
      });
    }

    if (req.user.sub === 0) {
      return res.status(400).json({
        message:
          "Password change requires a database admin account. Add your super admin to admin_users first.",
      });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({
        message: "Current password and new password (min 6 chars) are required",
      });
    }

    const user = await UserModel.findUserByEmail(req.user.email);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    await UserModel.updatePassword(user.id, newPassword);
    res.json({ success: true, message: "Password updated" });
  } catch (err) {
    console.error("changeMyPassword error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const listUsers = async (req, res) => {
  try {
    const users = await UserModel.listStaffUsers();
    res.json({ success: true, data: users, modules: ADMIN_MODULES });
  } catch (err) {
    console.error("listUsers error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const createUser = async (req, res) => {
  try {
    const { email, password, modules = [], moduleAccess } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const existing = await UserModel.findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const normalized = normalizeModuleList(moduleAccess ?? modules);
    if (normalized.length === 0) {
      return res.status(400).json({ message: "Select at least one module with permissions" });
    }
    const created = await UserModel.createStaffUser(
      email,
      password,
      moduleKeysFromList(normalized),
      null,
      normalized,
    );
    const authUser = await UserModel.buildAuthPayload(created);
    res.status(201).json({ success: true, user: authUser });
  } catch (err) {
    console.error("createUser error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateUserModules = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { modules = [], moduleAccess } = req.body;

    const user = await UserModel.findUserById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.role === SUPER_ADMIN_ROLE) {
      return res.status(400).json({ message: "Cannot change modules for super admin" });
    }

    const normalized = normalizeModuleList(moduleAccess ?? modules);
    if (normalized.length === 0) {
      return res.status(400).json({ message: "Select at least one module with permissions" });
    }
    await UserModel.setUserModules(
      userId,
      moduleKeysFromList(normalized),
      normalized,
    );
    const updated = await UserModel.findUserById(userId);
    const authUser = await UserModel.buildAuthPayload(updated);
    res.json({ success: true, user: authUser });
  } catch (err) {
    console.error("updateUserModules error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const setUserStatus = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { isActive } = req.body;

    const user = await UserModel.findUserById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.role === SUPER_ADMIN_ROLE) {
      return res.status(400).json({ message: "Cannot deactivate super admin" });
    }

    await UserModel.setUserActive(userId, Boolean(isActive));
    const updated = await UserModel.findUserById(userId);
    res.json({ success: true, is_active: updated?.is_active });
  } catch (err) {
    console.error("setUserStatus error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const revokeUser = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const result = await UserModel.deleteStaffUser(userId);
    if (!result.deleted) {
      return res.status(400).json({ message: result.reason || "Could not revoke user" });
    }
    res.json({ success: true, message: "User access revoked" });
  } catch (err) {
    console.error("revokeUser error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
