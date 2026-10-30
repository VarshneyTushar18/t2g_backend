import express from "express";
import { guardModuleOrApiKey } from "../../auth/auth.middleware.js";
import * as controller from "./careerAutomations.controller.js";

const adminCareer = guardModuleOrApiKey("career");
const router = express.Router();

router.get("/", ...adminCareer, controller.getDashboard);
router.put("/settings", ...adminCareer, controller.saveSettings);
router.get("/topics", ...adminCareer, controller.listTopics);
router.post("/topics", ...adminCareer, controller.createTopic);
router.delete("/topics/:id", ...adminCareer, controller.deleteTopic);
router.post("/run-now", ...adminCareer, controller.runNow);
router.post("/test-schedule-email", ...adminCareer, controller.testScheduleEmail);

export default router;
