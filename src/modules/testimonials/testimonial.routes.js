import express from "express";
import * as testimonialController from "./testimonial.controller.js";
import { testimonialUpload } from "../../config/multer.js";
import { guardModuleOrApiKey } from "../auth/auth.middleware.js";

const router = express.Router();
const adminTestimonials = guardModuleOrApiKey("testimonials");

router.get("/", testimonialController.getTestimonials);
router.get("/:id", testimonialController.getTestimonial);

router.post(
  "/",
  ...adminTestimonials,
  testimonialUpload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "companyLogo", maxCount: 1 },
  ]),
  testimonialController.createTestimonial,
);

router.put(
  "/:id",
  ...adminTestimonials,
  testimonialUpload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "companyLogo", maxCount: 1 },
  ]),
  testimonialController.updateTestimonial,
);

router.delete("/:id", ...adminTestimonials, testimonialController.deleteTestimonial);

export default router;
