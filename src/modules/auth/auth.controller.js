import jwt from "jsonwebtoken";

export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body; // ❌ removed cfToken

    // ✅ Basic validation only
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // ✅ Credential check
    if (
      email !== process.env.ADMIN_EMAIL ||
      password !== process.env.ADMIN_PASSWORD
    ) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // ✅ Generate token
    const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    // ⚠️ IMPORTANT: Fix cookie for local dev
    res.cookie("token", token, {
      httpOnly: true,
      secure: false,        // ❗ was TRUE → breaks on localhost
      sameSite: "lax",      // ❗ was "none"
    });

    res.json({ success: true, token });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};