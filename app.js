const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const { getWordGraph, getGraph, saveUserGraph } = require("./graphService");
const { authMiddleware, registerRoutes } = require("./auth");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend pages
const pages = ["index.html", "login.html", "dashboard.html", "review.html"];
pages.forEach(p => {
  app.get("/" + p, (req, res) => res.sendFile(path.join(__dirname, p)));
});
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

// Auth routes (register, login)
registerRoutes(app);

// =========================
// Word + graph generation
// =========================
app.get("/word", authMiddleware, async (req, res) => {
  const word = req.query.text;
  if (!word) return res.status(400).json({ error: "text required" });
  const result = await getWordGraph(word);
  saveUserGraph(req.userId, word);
  res.json(result);
});

app.get("/graph", authMiddleware, async (req, res) => {
  const word = req.query.text;
  if (!word) return res.status(400).json({ error: "text required" });
  await getWordGraph(word);
  saveUserGraph(req.userId, word);
  const graph = getGraph(word, req.userId);
  res.json({ elements: graph });
});

// =========================
// User data
// =========================
app.get("/user/me", authMiddleware, (req, res) => {
  const user = db.prepare(`SELECT id, username, created_at FROM users WHERE id = ?`).get(req.userId);
  res.json(user);
});

app.get("/user/graphs", authMiddleware, (req, res) => {
  const graphs = db.prepare(`
    SELECT root_word, created_at FROM user_graphs
    WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.userId);
  res.json({ graphs });
});

// All words the user has encountered (root words + neighbor words)
app.get("/user/words", authMiddleware, (req, res) => {
  const words = db.prepare(`
    WITH user_words AS (
      SELECT root_word AS word FROM user_graphs WHERE user_id = ?
      UNION
      SELECT e.to_word AS word
      FROM user_graphs ug
      JOIN edges e ON e.from_word = ug.root_word
      WHERE ug.user_id = ?
    )
    SELECT uw.word, n.definition, COALESCE(p.mastered, 0) AS mastered
    FROM user_words uw
    JOIN nodes n ON n.word = uw.word
    LEFT JOIN user_word_progress p ON p.word = uw.word AND p.user_id = ?
    ORDER BY uw.word
  `).all(req.userId, req.userId, req.userId);
  res.json({ words });
});

app.post("/user/progress", authMiddleware, (req, res) => {
  const { word, mastered } = req.body;
  if (!word) return res.status(400).json({ error: "word required" });
  db.prepare(`
    INSERT INTO user_word_progress (user_id, word, mastered, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, word) DO UPDATE SET mastered = excluded.mastered, updated_at = CURRENT_TIMESTAMP
  `).run(req.userId, word, mastered ? 1 : 0);
  res.json({ ok: true });
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
