import express from "express";
import {
  verifyAdminOrApiKey,
  requireModule,
} from "../auth/auth.middleware.js";
import { canPerform } from "../auth/modulePermissions.js";
import { requireBlogDb } from "../../middleware/requireBlogDb.js";
import * as controller from "./blog20.agent.controller.js";

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

router.use(requireBlogDb);

router.get("/status", ...requireBlog20View, controller.getStatus);
router.get("/drafts", ...requireBlog20View, controller.listDrafts);
router.get("/threads", ...requireBlog20View, controller.listThreads);
router.post("/threads", ...requireBlog20View, controller.createThread);
router.get("/threads/:threadId", ...requireBlog20View, controller.getThread);
router.delete("/threads/:threadId", ...requireBlog20View, controller.deleteThread);
router.get("/threads/:threadId/messages", ...requireBlog20View, controller.getMessages);
router.post("/threads/:threadId/messages", ...requireBlog20View, controller.sendMessage);
router.post("/threads/:threadId/feedback", ...requireBlog20View, controller.addFeedback);
router.get("/guidelines", ...requireBlog20View, controller.getGuidelines);

export default router;
