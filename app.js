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
const pages = ["index.html", "login.html", "dashboard.html", "review.html", "mygraph.html"];
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

// All words the user has encountered (root words + neighbor words), excluding deleted
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
    WHERE uw.word NOT IN (SELECT word FROM user_excluded_words WHERE user_id = ?)
    ORDER BY uw.word
  `).all(req.userId, req.userId, req.userId, req.userId);
  res.json({ words });
});

// Delete (exclude) a word from user's vocab
app.delete("/user/words", authMiddleware, (req, res) => {
  const word = req.query.word;
  if (!word) return res.status(400).json({ error: "word required" });
  db.prepare(`INSERT OR IGNORE INTO user_excluded_words (user_id, word) VALUES (?, ?)`).run(req.userId, word);
  db.prepare(`DELETE FROM user_graphs WHERE user_id = ? AND root_word = ?`).run(req.userId, word);
  res.json({ ok: true });
});

// Update edge relation type
app.put("/edges", authMiddleware, (req, res) => {
  const { from_word, to_word, relation_type } = req.body;
  if (!from_word || !to_word || !relation_type) return res.status(400).json({ error: "from_word, to_word, relation_type required" });
  db.prepare(`UPDATE edges SET relation_type = ? WHERE from_word = ? AND to_word = ?`).run(relation_type, from_word, to_word);
  db.prepare(`UPDATE reverse_edges SET relation_type = ? WHERE from_word = ? AND to_word = ?`).run(relation_type, to_word, from_word);
  res.json({ ok: true });
});

// Manually add a new word with definition and edge
app.post("/user/add-word", authMiddleware, (req, res) => {
  const { word, definition, connect_to, relation_type } = req.body;
  if (!word || !connect_to) return res.status(400).json({ error: "word and connect_to required" });
  const type = relation_type || "related";
  db.prepare(`
    INSERT INTO nodes (word, definition) VALUES (?, ?)
    ON CONFLICT(word) DO UPDATE SET definition = COALESCE(excluded.definition, definition)
  `).run(word.trim(), definition?.trim() || null);
  db.prepare(`INSERT OR IGNORE INTO edges (from_word, to_word, relation_type) VALUES (?, ?, ?)`).run(connect_to, word.trim(), type);
  db.prepare(`INSERT OR IGNORE INTO reverse_edges (from_word, to_word, relation_type) VALUES (?, ?, ?)`).run(word.trim(), connect_to, type);
  // Treat manually added word as a root word so it always shows in the user's graph
  db.prepare(`INSERT OR IGNORE INTO user_graphs (user_id, root_word) VALUES (?, ?)`).run(req.userId, word.trim());
  // Remove from excluded list if previously deleted
  db.prepare(`DELETE FROM user_excluded_words WHERE user_id = ? AND word = ?`).run(req.userId, word.trim());
  res.json({ ok: true });
});

// Full graph of all user words + edges (for mygraph.html)
app.get("/user/graph-data", authMiddleware, (req, res) => {
  const words = db.prepare(`
    WITH user_words AS (
      SELECT root_word AS word FROM user_graphs WHERE user_id = ?
      UNION
      SELECT e.to_word AS word
      FROM user_graphs ug
      JOIN edges e ON e.from_word = ug.root_word
      WHERE ug.user_id = ?
    )
    SELECT uw.word, n.definition, COALESCE(p.mastered, 0) AS mastered,
           CASE WHEN ug.root_word IS NOT NULL THEN 1 ELSE 0 END AS is_root
    FROM user_words uw
    JOIN nodes n ON n.word = uw.word
    LEFT JOIN user_word_progress p ON p.word = uw.word AND p.user_id = ?
    LEFT JOIN user_graphs ug ON ug.root_word = uw.word AND ug.user_id = ?
    WHERE uw.word NOT IN (SELECT word FROM user_excluded_words WHERE user_id = ?)
  `).all(req.userId, req.userId, req.userId, req.userId, req.userId);

  const edges = db.prepare(`
    WITH user_words AS (
      SELECT root_word AS word FROM user_graphs WHERE user_id = ?
      UNION
      SELECT e.to_word AS word
      FROM user_graphs ug
      JOIN edges e ON e.from_word = ug.root_word
      WHERE ug.user_id = ?
    )
    SELECT e.from_word, e.to_word, e.relation_type
    FROM edges e
    JOIN user_words uw1 ON uw1.word = e.from_word
    JOIN user_words uw2 ON uw2.word = e.to_word
  `).all(req.userId, req.userId);

  const nodes = words.map(w => ({
    data: { id: w.word, definition: w.definition, mastered: w.mastered, isRoot: w.is_root }
  }));
  const edgeList = edges.map(e => ({
    data: { id: `${e.from_word}-${e.to_word}`, source: e.from_word, target: e.to_word, type: e.relation_type || "related" }
  }));

  res.json({ elements: [...nodes, ...edgeList] });
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
