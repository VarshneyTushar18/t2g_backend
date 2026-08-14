import jwt from "jsonwebtoken";
import { ROLE_MODULES, SUPER_ADMIN_ROLE } from "./auth.constants.js";
import { canPerform, httpMethodToAction } from "./modulePermissions.js";
import * as ApiKeyModel from "../connect/apiKey.model.js";

const isCrossSiteAdmin =
  process.env.NODE_ENV === "production" ||
  process.env.AUTH_COOKIE_CROSS_SITE === "true";

const cookieOptions = {
  httpOnly: true,
  secure: isCrossSiteAdmin,
  sameSite: isCrossSiteAdmin ? "none" : "lax",
};

export { cookieOptions };

/** Legacy JWTs from old login used role "admin" — treat as super admin */
const isSuperAdminUser = (user) =>
  user?.role === SUPER_ADMIN_ROLE || user?.role === "admin";

export const extractApiKey = (req) => {
  const headerKey = req.headers["x-api-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }
  return null;
};

export const verifyAdmin = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

/** Cookie JWT or x-api-key / Bearer — for module APIs used by external tools */
export const verifyAdminOrApiKey = async (req, res, next) => {
  const rawKey = extractApiKey(req);
  if (rawKey) {
    try {
      const record = await ApiKeyModel.findActiveKeyByRaw(rawKey);
      if (!record) {
        return res.status(401).json({ message: "Invalid API key" });
      }
      await ApiKeyModel.touchLastUsed(record.id);
      let moduleList = record.modules;
      if (typeof moduleList === "string") {
        try {
          moduleList = JSON.parse(moduleList);
        } catch {
          moduleList = [];
        }
      }
      const { modules, permissions } = ApiKeyModel.buildKeyPermissions(
        Array.isArray(moduleList) ? moduleList : [],
        record.read_only === 1 || record.read_only === true,
      );
      req.user = {
        sub: `apikey:${record.id}`,
        role: "api_key",
        modules,
        permissions,
        apiKeyId: record.id,
        apiKeyName: record.name,
      };
      return next();
    } catch (err) {
      if (err.code === "ER_NO_SUCH_TABLE") {
        return res.status(503).json({
          message: "API keys not configured. Run sql/api_keys.sql migration.",
        });
      }
      console.error("verifyAdminOrApiKey:", err);
      return res.status(500).json({ message: "API key verification failed" });
    }
  }
  return verifyAdmin(req, res, next);
};

export const requireSuperAdmin = (req, res, next) => {
  if (!isSuperAdminUser(req.user)) {
    return res.status(403).json({ message: "Super admin access required" });
  }
  next();
};

export const requireModule =
  (moduleKey) =>
  (req, res, next) => {
    if (isSuperAdminUser(req.user)) return next();

    let modules = req.user?.modules || [];
    if (!modules.length && req.user?.role) {
      modules = ROLE_MODULES[req.user.role] || [];
    }

    if (!modules.includes(moduleKey)) {
      return res.status(403).json({ message: "You do not have access to this module" });
    }
    next();
  };

/** Enforce view / add / edit / delete from JWT permissions (GET→view, POST→add, …) */
export const enforceModulePermission =
  (moduleKey) =>
  (req, res, next) => {
    if (isSuperAdminUser(req.user)) return next();

    let permissions = req.user?.permissions;
    if (!permissions || !Object.keys(permissions).length) {
      return next();
    }

    const action = httpMethodToAction(req.method);
    if (!canPerform(permissions, moduleKey, action)) {
      return res.status(403).json({
        message: `You do not have ${action} access for this module`,
      });
    }
    next();
  };

export const guardModule = (moduleKey) => [
  verifyAdmin,
  requireModule(moduleKey),
  enforceModulePermission(moduleKey),
];

/** Same as guardModule but also accepts x-api-key (external tools only — not admin UI) */
export const guardModuleOrApiKey = (moduleKey) => [
  verifyAdminOrApiKey,
  requireModule(moduleKey),
  enforceModulePermission(moduleKey),
];
