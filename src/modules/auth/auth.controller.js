import jwt from "jsonwebtoken";

export const loginAdmin = async (req, res) => {
  try {
    const { email, password, cfToken } = req.body;

    if (!email || !password || !cfToken) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Verify Turnstile
    const verify = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: process.env.TURNSTILE_SECRET,
          response: cfToken,
        }),
      }
    );

    const captcha = await verify.json();
    if (!captcha.success) {
      return res.status(400).json({ message: "Captcha verification failed" });
    }

    if (
      email !== process.env.ADMIN_EMAIL ||
      password !== process.env.ADMIN_PASSWORD
    ) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    // Set token as httpOnly cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: false,       // set true in production (HTTPS)
      sameSite: "lax",
      maxAge: 60 * 60 * 1000, // 1 hour
    });

    res.json({ success: true });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};