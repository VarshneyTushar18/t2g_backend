import express from "express";
import * as testimonialController from "./testimonial.controller.js";
import { testimonialUpload } from "../../config/multer.js"

const router = express.Router();

router.get("/", testimonialController.getTestimonials);

router.get("/:id", testimonialController.getTestimonial);

router.post("/",
  testimonialUpload.fields([
    { name: "avatar",      maxCount: 1 },
    { name: "companyLogo", maxCount: 1 }
  ]),
  testimonialController.createTestimonial
);

router.put("/:id",
  testimonialUpload.fields([
    { name: "avatar",      maxCount: 1 },
    { name: "companyLogo", maxCount: 1 }
  ]),
  testimonialController.updateTestimonial
);

router.delete("/:id", testimonialController.deleteTestimonial);

export default router;
