import express from "express";
import {
  verifyAdminOrApiKey,
  requireModule,
} from "../../auth/auth.middleware.js";
import { canPerform } from "../../auth/modulePermissions.js";
import { requireBlogDb } from "../../../middleware/requireBlogDb.js";
import * as controller from "./blogImage.controller.js";

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
        return res.status(403).json({
          message: "You do not have view access for blog",
        });
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
        return res.status(403).json({
          message: "You do not have edit access for blog",
        });
      }
    }
    next();
  },
];

router.use(requireBlogDb);

router.get("/status", ...requireBlogView, controller.getStatus);
router.get("/gallery", ...requireBlogView, controller.listGallery);

router.get("/threads", ...requireBlogView, controller.listThreads);
router.post("/threads", ...requireBlogView, controller.createThread);
router.get("/threads/:threadId", ...requireBlogView, controller.getThread);
router.delete("/threads/:threadId", ...requireBlogView, controller.deleteThread);

router.get("/threads/:threadId/messages", ...requireBlogView, controller.getMessages);
router.post("/threads/:threadId/messages", ...requireBlogView, controller.sendMessage);
router.post("/threads/:threadId/feedback", ...requireBlogView, controller.addFeedback);

router.get("/guidelines", ...requireBlogView, controller.getGuidelines);
router.put("/guidelines", ...requireBlogEdit, controller.updateGuidelines);

export default router;
