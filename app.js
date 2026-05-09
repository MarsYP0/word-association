const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const { getWordGraph, getGraph, saveUserGraph } = require("./graphService");
const { authMiddleware, registerRoutes } = require("./auth");
const { generateDomainSeeds } = require("./ai");
const db = require("./db");

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "domain-" + Date.now();
}

async function runDomainBuild(domainId, jobId, domainName) {
  try {
    db.prepare(`UPDATE domain_build_jobs SET status = 'generating_seeds' WHERE id = ?`).run(jobId);

    const { seeds } = await generateDomainSeeds(domainName);
    const allTerms = Array.isArray(seeds) ? seeds.slice(0, 30) : [];

    db.prepare(`UPDATE domain_build_jobs SET status = 'building', total = ? WHERE id = ?`).run(allTerms.length, jobId);

    for (let i = 0; i < allTerms.length; i++) {
      const term = allTerms[i];
      try {
        await getWordGraph(term);
      } catch (_) {
        // AI call failed; seed still gets tagged below with whatever is cached
      }
      // Always tag the seed and any neighbors (cached or freshly generated)
      db.prepare(`INSERT OR IGNORE INTO node_domains (word, domain_id) VALUES (?, ?)`).run(term, domainId);
      const neighbors = db.prepare(`SELECT to_word FROM edges WHERE from_word = ?`).all(term);
      for (const { to_word } of neighbors) {
        db.prepare(`INSERT OR IGNORE INTO node_domains (word, domain_id) VALUES (?, ?)`).run(to_word, domainId);
      }
      db.prepare(`UPDATE domain_build_jobs SET progress = ? WHERE id = ?`).run(i + 1, jobId);
      await sleep(1500);
    }

    db.prepare(`UPDATE domain_build_jobs SET status = 'done' WHERE id = ?`).run(jobId);
  } catch (e) {
    db.prepare(`UPDATE domain_build_jobs SET status = 'error', error = ? WHERE id = ?`).run(e.message, jobId);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend pages
const pages = ["index.html", "login.html", "dashboard.html", "review.html", "mygraph.html", "domain.html"];
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
  db.prepare(`DELETE FROM user_excluded_words WHERE user_id = ? AND word = ?`).run(req.userId, word);
  res.json(result);
});

app.get("/graph", authMiddleware, async (req, res) => {
  const word = req.query.text;
  if (!word) return res.status(400).json({ error: "text required" });
  await getWordGraph(word);
  saveUserGraph(req.userId, word);
  db.prepare(`DELETE FROM user_excluded_words WHERE user_id = ? AND word = ?`).run(req.userId, word);
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
// Optional ?domain_id=X to filter by domain
app.get("/user/words", authMiddleware, (req, res) => {
  const domainId = req.query.domain_id;
  let words;

  if (domainId) {
    words = db.prepare(`
      SELECT nd.word, n.definition, COALESCE(p.mastered, 0) AS mastered
      FROM node_domains nd
      JOIN nodes n ON n.word = nd.word
      LEFT JOIN user_word_progress p ON p.word = nd.word AND p.user_id = ?
      WHERE nd.domain_id = ?
        AND nd.word NOT IN (SELECT word FROM user_excluded_words WHERE user_id = ?)
      ORDER BY nd.word
    `).all(req.userId, domainId, req.userId);
  } else {
    words = db.prepare(`
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
  }

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
// Delete edge from user's view (user-level exclusion)
app.delete("/edges", authMiddleware, (req, res) => {
  const { from_word, to_word } = req.query;
  if (!from_word || !to_word) return res.status(400).json({ error: "from_word and to_word required" });
  db.prepare(`INSERT OR IGNORE INTO user_excluded_edges (user_id, from_word, to_word) VALUES (?, ?, ?)`).run(req.userId, from_word, to_word);
  db.prepare(`INSERT OR IGNORE INTO user_excluded_edges (user_id, from_word, to_word) VALUES (?, ?, ?)`).run(req.userId, to_word, from_word);
  res.json({ ok: true });
});

// Add edge between two existing words
app.post("/user/add-edge", authMiddleware, (req, res) => {
  const { from_word, to_word, relation_type } = req.body;
  if (!from_word || !to_word) return res.status(400).json({ error: "from_word and to_word required" });
  const type = relation_type || "related";
  db.prepare(`INSERT OR IGNORE INTO edges (from_word, to_word, relation_type) VALUES (?, ?, ?)`).run(from_word, to_word, type);
  db.prepare(`INSERT OR IGNORE INTO reverse_edges (from_word, to_word, relation_type) VALUES (?, ?, ?)`).run(to_word, from_word, type);
  // Restore if previously excluded
  db.prepare(`DELETE FROM user_excluded_edges WHERE user_id = ? AND from_word = ? AND to_word = ?`).run(req.userId, from_word, to_word);
  db.prepare(`DELETE FROM user_excluded_edges WHERE user_id = ? AND from_word = ? AND to_word = ?`).run(req.userId, to_word, from_word);
  res.json({ ok: true });
});

app.put("/edges", authMiddleware, (req, res) => {
  const { from_word, to_word, relation_type } = req.body;
  if (!from_word || !to_word || !relation_type) return res.status(400).json({ error: "from_word, to_word, relation_type required" });
  const upsert = db.prepare(`
    INSERT INTO user_edge_overrides (user_id, from_word, to_word, relation_type)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, from_word, to_word) DO UPDATE SET relation_type = excluded.relation_type
  `);
  upsert.run(req.userId, from_word, to_word, relation_type);
  upsert.run(req.userId, to_word, from_word, relation_type);
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
    ),
    visible AS (
      SELECT word FROM user_words
      WHERE word NOT IN (SELECT word FROM user_excluded_words WHERE user_id = ?)
    )
    SELECT e.from_word, e.to_word,
           COALESCE(ueo.relation_type, e.relation_type) AS relation_type
    FROM edges e
    JOIN visible uw1 ON uw1.word = e.from_word
    JOIN visible uw2 ON uw2.word = e.to_word
    LEFT JOIN user_edge_overrides ueo
      ON ueo.user_id = ? AND ueo.from_word = e.from_word AND ueo.to_word = e.to_word
    WHERE NOT EXISTS (
      SELECT 1 FROM user_excluded_edges uee
      WHERE uee.user_id = ? AND uee.from_word = e.from_word AND uee.to_word = e.to_word
    )
  `).all(req.userId, req.userId, req.userId, req.userId, req.userId);

  const nodes = words.map(w => ({
    data: { id: w.word, definition: w.definition, mastered: w.mastered, isRoot: w.is_root }
  }));
  const edgeList = edges.map(e => ({
    data: { id: `${e.from_word}-${e.to_word}`, source: e.from_word, target: e.to_word, type: e.relation_type || "related" }
  }));

  res.json({ elements: [...nodes, ...edgeList] });
});

// =========================
// Domain knowledge graphs
// =========================

// Create a new domain and kick off background build
app.post("/domains", authMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name required" });

  const trimmedName = name.trim();
  let slug = slugify(trimmedName);

  // Ensure slug is unique
  const existing = db.prepare(`SELECT id FROM domains WHERE slug = ?`).get(slug);
  if (existing) slug = slug + "-" + Date.now();

  db.prepare(`
    INSERT INTO domains (name, slug, description, color)
    VALUES (?, ?, ?, '#6C7AE0')
  `).run(trimmedName, slug, trimmedName);

  const domain = db.prepare(`SELECT * FROM domains WHERE slug = ?`).get(slug);
  const job = db.prepare(`INSERT INTO domain_build_jobs (domain_id) VALUES (?)`).run(domain.id);

  // Start background build without awaiting
  runDomainBuild(domain.id, job.lastInsertRowid, trimmedName);

  res.json({ id: domain.id, name: domain.name, slug: domain.slug, jobId: job.lastInsertRowid });
});

// Poll build progress
app.get("/domains/:id/status", (req, res) => {
  const job = db.prepare(`
    SELECT status, progress, total, error
    FROM domain_build_jobs WHERE domain_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(req.params.id);
  res.json(job || { status: "none" });
});

// Subscribe user to a domain (adds all domain words to user's vocab)
app.post("/user/domains/:id", authMiddleware, (req, res) => {
  const domain = db.prepare(`SELECT * FROM domains WHERE id = ?`).get(req.params.id);
  if (!domain) return res.status(404).json({ error: "Domain not found" });

  db.prepare(`INSERT OR IGNORE INTO user_domain_subscriptions (user_id, domain_id) VALUES (?, ?)`).run(req.userId, domain.id);

  const words = db.prepare(`SELECT word FROM node_domains WHERE domain_id = ?`).all(domain.id);
  for (const { word } of words) {
    // Only insert if the word isn't already manually explored (preserve manually explored entries without domain_id)
    db.prepare(`
      INSERT OR IGNORE INTO user_graphs (user_id, root_word, domain_id) VALUES (?, ?, ?)
    `).run(req.userId, word, domain.id);
    db.prepare(`DELETE FROM user_excluded_words WHERE user_id = ? AND word = ?`).run(req.userId, word);
  }

  res.json({ ok: true, added: words.length });
});

// Unsubscribe user from a domain — removes only words added via this domain subscription
app.delete("/user/domains/:id", authMiddleware, (req, res) => {
  db.prepare(`DELETE FROM user_domain_subscriptions WHERE user_id = ? AND domain_id = ?`).run(req.userId, req.params.id);
  db.prepare(`DELETE FROM user_graphs WHERE user_id = ? AND domain_id = ?`).run(req.userId, req.params.id);
  res.json({ ok: true });
});

// List user's subscribed domains
app.get("/user/domains", authMiddleware, (req, res) => {
  const domains = db.prepare(`
    SELECT d.id, d.name, d.slug, d.color
    FROM user_domain_subscriptions uds
    JOIN domains d ON d.id = uds.domain_id
    WHERE uds.user_id = ?
    ORDER BY uds.created_at
  `).all(req.userId);
  res.json({ domains });
});

app.get("/domains", (req, res) => {
  const domains = db.prepare(`
    SELECT d.id, d.name, d.slug, d.description, d.color,
           COUNT(nd.word) AS word_count
    FROM domains d
    LEFT JOIN node_domains nd ON nd.domain_id = d.id
    GROUP BY d.id
    ORDER BY d.created_at
  `).all();
  res.json({ domains });
});

app.get("/domains/:id/graph", (req, res) => {
  const domain = db.prepare(`SELECT * FROM domains WHERE id = ? OR slug = ?`).get(req.params.id, req.params.id);
  if (!domain) return res.status(404).json({ error: "Domain not found" });

  const words = db.prepare(`
    SELECT n.word, n.definition
    FROM node_domains nd
    JOIN nodes n ON n.word = nd.word
    WHERE nd.domain_id = ?
  `).all(domain.id);

  const edges = db.prepare(`
    SELECT e.from_word, e.to_word, e.relation_type
    FROM edges e
    WHERE e.from_word IN (SELECT word FROM node_domains WHERE domain_id = ?)
      AND e.to_word   IN (SELECT word FROM node_domains WHERE domain_id = ?)
  `).all(domain.id, domain.id);

  const nodes = words.map(w => ({
    data: { id: w.word, definition: w.definition }
  }));
  const edgeList = edges.map(e => ({
    data: { id: `${e.from_word}-${e.to_word}`, source: e.from_word, target: e.to_word, type: e.relation_type || "related" }
  }));

  res.json({ domain, elements: [...nodes, ...edgeList] });
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
