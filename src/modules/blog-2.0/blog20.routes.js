import express from "express";
import {
  verifyAdminOrApiKey,
  requireModule,
} from "../auth/auth.middleware.js";
import { canPerform } from "../auth/modulePermissions.js";
import { requireBlogDb } from "../../middleware/requireBlogDb.js";
import * as controller from "./blog20.controller.js";

const router = express.Router();
const MODULE = "blog_2_0";

const isSuperAdminUser = (user) =>
  user?.role === "super_admin" || user?.role === "admin";

const requireBlog20View = [
  verifyAdminOrApiKey,
  requireModule(MODULE),
  (req, res, next) => {
    if (isSuperAdminUser(req.user)) return next();
    const permissions = req.user?.permissions;
    if (permissions && Object.keys(permissions).length) {
      if (!canPerform(permissions, MODULE, "view")) {
        return res.status(403).json({ message: "No Blog-2.0 view access" });
      }
    }
    next();
  },
];

const requireBlog20Edit = [
  verifyAdminOrApiKey,
  requireModule(MODULE),
  (req, res, next) => {
    if (isSuperAdminUser(req.user)) return next();
    const permissions = req.user?.permissions;
    if (permissions && Object.keys(permissions).length) {
      if (!canPerform(permissions, MODULE, "edit")) {
        return res.status(403).json({ message: "No Blog-2.0 edit access" });
      }
    }
    next();
  },
];

router.use(requireBlogDb);

router.get("/overview", ...requireBlog20View, controller.getOverview);
router.get("/checklist", ...requireBlog20View, controller.getChecklist);
router.get("/settings", ...requireBlog20View, controller.getSettings);
router.put("/settings", ...requireBlog20Edit, controller.updateSettings);
router.post("/mailerlite/test", ...requireBlog20Edit, controller.testMailerLite);
router.post("/mailerlite/bot/test", ...requireBlog20Edit, controller.testMailerLiteBot);
router.get("/drafts", ...requireBlog20View, controller.listDrafts);
router.get("/drafts/:id", ...requireBlog20View, controller.getDraft);
router.post(
  "/drafts/:id/push-mailerlite",
  ...requireBlog20Edit,
  controller.pushDraftToMailerLiteSite,
);

export default router;
