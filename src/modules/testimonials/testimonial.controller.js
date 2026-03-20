import * as testimonialModel from "./testimonial.model.js";

export const getTestimonials = async (req, res) => {
  try {

    const testimonials = await testimonialModel.getAllTestimonials();

    res.status(200).json({
      success: true,
      data: testimonials
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


export const getTestimonial = async (req, res) => {
  try {

    const testimonial = await testimonialModel.getTestimonialById(req.params.id);

    res.status(200).json({
      success: true,
      data: testimonial
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


export const createTestimonial = async (req, res) => {
  try {
    const { name, stars, text, companyName, link } = req.body;
    const avatar      = req.files?.avatar?.[0]?.path      || null;
    const companyLogo = req.files?.companyLogo?.[0]?.path || null;

    await testimonialModel.createTestimonial({
      name, stars, text,
      companyName, link,
      avatar, companyLogo
    });

    res.status(201).json({ success: true, message: "Testimonial created successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateTestimonial = async (req, res) => {
  try {
    const { name, stars, text, companyName, link, status } = req.body;

    const existing    = await testimonialModel.getTestimonialById(req.params.id);
    const avatar      = req.files?.avatar?.[0]?.path      || existing.avatar;
    const companyLogo = req.files?.companyLogo?.[0]?.path || existing.company_logo_url;

    await testimonialModel.updateTestimonial(req.params.id, {
      name, stars, text,
      companyName, link, status,
      avatar, companyLogo
    });

    res.status(200).json({ success: true, message: "Testimonial updated successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


export const deleteTestimonial = async (req, res) => {
  try {

    await testimonialModel.deleteTestimonial(req.params.id);

    res.status(200).json({
      success: true,
      message: "Testimonial deleted successfully"
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};