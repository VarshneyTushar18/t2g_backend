import express from "express";
import {
  verifyAdminOrApiKey,
  requireModule,
} from "../../auth/auth.middleware.js";
import { canPerform } from "../../auth/modulePermissions.js";
import { requireBlogDb } from "../../../middleware/requireBlogDb.js";
import * as controller from "./agentAutomations.controller.js";

const router = express.Router();
const MODULE = "blog";

const isSuperAdminUser = (user) =>
  user?.role === "super_admin" || user?.role === "admin";

const requireBlogView = [
  verifyAdminOrApiKey,
  requireModule(MODULE),
  (req, res, next) => {
    if (isSuperAdminUser(req.user)) return next();
    const permissions = req.user?.permissions;
    if (permissions && Object.keys(permissions).length) {
      if (!canPerform(permissions, MODULE, "view")) {
        return res.status(403).json({ message: "No blog view access" });
      }
    }
    next();
  },
];

const requireBlogEdit = [
  verifyAdminOrApiKey,
  requireModule(MODULE),
  (req, res, next) => {
    if (isSuperAdminUser(req.user)) return next();
    const permissions = req.user?.permissions;
    if (permissions && Object.keys(permissions).length) {
      if (!canPerform(permissions, MODULE, "edit")) {
        return res.status(403).json({ message: "No blog edit access" });
      }
    }
    next();
  },
];

router.use(requireBlogDb);

router.get("/settings", ...requireBlogView, controller.getSettings);
router.put("/settings", ...requireBlogEdit, controller.updateSettings);

router.get("/topics", ...requireBlogView, controller.listTopics);
router.post("/topics", ...requireBlogEdit, controller.createTopic);
router.put("/topics/:id", ...requireBlogEdit, controller.updateTopic);
router.delete("/topics/:id", ...requireBlogEdit, controller.deleteTopic);

router.post("/run-now", ...requireBlogEdit, controller.runNow);
router.post("/test-email", ...requireBlogEdit, controller.testSampleEmail);

export default router;
