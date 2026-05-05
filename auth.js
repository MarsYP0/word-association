const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("./db");

const SECRET = process.env.JWT_SECRET || "wg-dev-secret-change-in-prod";

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Not authenticated" });
  try {
    const payload = jwt.verify(header.replace("Bearer ", ""), SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function registerRoutes(app) {
  app.post("/auth/register", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Username and password required" });
    if (password.length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters" });

    const existing = db.prepare(`SELECT id FROM users WHERE username = ?`).get(username);
    if (existing)
      return res.status(400).json({ error: "Username already taken" });

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`INSERT INTO users (username, password_hash) VALUES (?, ?)`).run(username, hash);
    const token = jwt.sign({ userId: result.lastInsertRowid }, SECRET, { expiresIn: "7d" });
    res.json({ token, username });
  });

  app.post("/auth/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Username and password required" });

    const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: "Invalid username or password" });

    const token = jwt.sign({ userId: user.id }, SECRET, { expiresIn: "7d" });
    res.json({ token, username: user.username });
  });
}

module.exports = { authMiddleware, registerRoutes };
