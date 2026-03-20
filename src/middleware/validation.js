export const validateLead = (req, res, next) => {

  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({
      success: false,
      message: "Name, email and message are required"
    });
  }

  next();
};