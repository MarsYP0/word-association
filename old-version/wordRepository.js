const db = require("./db");

// =========================
// 查单词是否存在
// =========================
function getWord(word) {
  return db.prepare("SELECT * FROM words WHERE word = ?").get(word);
}

// =========================
// 存单词
// =========================
function saveWord(word, meaning) {
  db.prepare(`
    INSERT OR IGNORE INTO words (word, meaning)
    VALUES (?, ?)
  `).run(word, meaning);
}

// =========================
// 存联想词
// =========================
function saveAssociations(word, list) {
  const stmt = db.prepare(`
    INSERT INTO associations (word, related_word)
    VALUES (?, ?)
  `);

  for (const item of list) {
    stmt.run(word, item);
  }
}

// =========================
// 查联想词
// =========================
function getAssociations(word) {
  return db
    .prepare("SELECT related_word FROM associations WHERE word = ?")
    .all(word)
    .map(r => r.related_word);
}

module.exports = {
  getWord,
  saveWord,
  saveAssociations,
  getAssociations
};