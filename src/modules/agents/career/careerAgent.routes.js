import express from "express";
import {
  verifyAdminOrApiKey,
  requireModule,
} from "../../auth/auth.middleware.js";
import { canPerform } from "../../auth/modulePermissions.js";
import { requireBlogDb } from "../../../middleware/requireBlogDb.js";
import * as controller from "./careerAgent.controller.js";

const router = express.Router();
const MODULE = "career";

const isSuperAdminUser = (user) =>
  user?.role === "super_admin" || user?.role === "admin";

const requireCareerView = [
  verifyAdminOrApiKey,
  requireModule(MODULE),
  (req, res, next) => {
    if (isSuperAdminUser(req.user)) return next();
    const permissions = req.user?.permissions;
    if (permissions && Object.keys(permissions).length) {
      if (!canPerform(permissions, MODULE, "view")) {
        return res.status(403).json({
          message: "You do not have view access for career",
        });
      }
    }
    next();
  },
];

const requireCareerEdit = [
  verifyAdminOrApiKey,
  requireModule(MODULE),
  (req, res, next) => {
    if (isSuperAdminUser(req.user)) return next();
    const permissions = req.user?.permissions;
    if (permissions && Object.keys(permissions).length) {
      if (!canPerform(permissions, MODULE, "edit")) {
        return res.status(403).json({
          message: "You do not have edit access for career guidelines",
        });
      }
    }
    next();
  },
];

router.use(requireBlogDb);

router.get("/status", ...requireCareerView, controller.getStatus);
router.get("/threads", ...requireCareerView, controller.listThreads);
router.post("/threads", ...requireCareerView, controller.createThread);
router.get("/threads/:threadId", ...requireCareerView, controller.getThread);
router.delete(
  "/threads/:threadId",
  ...requireCareerView,
  controller.deleteThread,
);
router.get(
  "/threads/:threadId/messages",
  ...requireCareerView,
  controller.getMessages,
);
router.post(
  "/threads/:threadId/messages",
  ...requireCareerView,
  controller.sendMessage,
);
router.post(
  "/threads/:threadId/feedback",
  ...requireCareerView,
  controller.addFeedback,
);
router.get("/guidelines", ...requireCareerView, controller.getGuidelines);
router.put("/guidelines", ...requireCareerEdit, controller.updateGuidelines);

export default router;
