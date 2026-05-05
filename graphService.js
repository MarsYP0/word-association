const db = require("./db");
const { generateAssociations } = require("./ai");

function saveNode(word, definition = null) {
  db.prepare(`
    INSERT INTO nodes (word, definition) VALUES (?, ?)
    ON CONFLICT(word) DO UPDATE SET definition = COALESCE(excluded.definition, definition)
  `).run(word, definition);
}

function saveEdge(from, to, type = null) {
  db.prepare(`INSERT INTO edges (from_word, to_word, relation_type) VALUES (?, ?, ?)`).run(from, to, type);
  db.prepare(`INSERT INTO reverse_edges (from_word, to_word, relation_type) VALUES (?, ?, ?)`).run(to, from, type);
}

function saveUserGraph(userId, word) {
  db.prepare(`INSERT OR IGNORE INTO user_graphs (user_id, root_word) VALUES (?, ?)`).run(userId, word);
}

async function getWordGraph(word) {
  saveNode(word);

  const existing = db.prepare(`SELECT to_word FROM edges WHERE from_word = ?`).all(word);

  if (existing.length < 5) {
    const result = await generateAssociations(word);
    const { definition, associations } = result;

    db.prepare(`UPDATE nodes SET definition = ? WHERE word = ?`).run(definition, word);

    for (const { word: w, type } of associations) {
      saveNode(w);
      saveEdge(word, w, type);
    }

    return { word, from: "ai", associations: associations.map(a => a.word) };
  }

  return { word, from: "cache", associations: existing.map(e => e.to_word) };
}

function getGraph(word, userId = null) {
  const edges = db.prepare(`SELECT to_word, relation_type FROM edges WHERE from_word = ?`).all(word);
  const wordRow = db.prepare(`SELECT definition FROM nodes WHERE word = ?`).get(word);

  let progress = {};
  if (userId) {
    const rows = db.prepare(`SELECT word, mastered FROM user_word_progress WHERE user_id = ?`).all(userId);
    progress = Object.fromEntries(rows.map(r => [r.word, r.mastered]));
  }

  const nodes = [{ data: { id: word, definition: wordRow?.definition || null, mastered: progress[word] ?? 0 } }];
  const edgeList = [];
  const seen = new Set([word]);

  for (const e of edges) {
    if (!seen.has(e.to_word)) {
      seen.add(e.to_word);
      const row = db.prepare(`SELECT definition FROM nodes WHERE word = ?`).get(e.to_word);
      nodes.push({ data: { id: e.to_word, definition: row?.definition || null, mastered: progress[e.to_word] ?? 0 } });
    }
    edgeList.push({
      data: {
        id: `${word}-${e.to_word}`,
        source: word,
        target: e.to_word,
        type: e.relation_type || "related"
      }
    });
  }

  return [...nodes, ...edgeList];
}

module.exports = { getWordGraph, getGraph, saveUserGraph };
