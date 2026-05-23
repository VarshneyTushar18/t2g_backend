import jwt from "jsonwebtoken";
import { ROLE_MODULES, SUPER_ADMIN_ROLE } from "./auth.constants.js";
import { canPerform, httpMethodToAction } from "./modulePermissions.js";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
};

export { cookieOptions };

/** Legacy JWTs from old login used role "admin" — treat as super admin */
const isSuperAdminUser = (user) =>
  user?.role === SUPER_ADMIN_ROLE || user?.role === "admin";

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
