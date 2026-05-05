const Database = require("better-sqlite3");

const db = new Database("words.db");

// 节点（单词）
db.exec(`
CREATE TABLE IF NOT EXISTS nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT UNIQUE
);
`);

// 边（关系）
db.exec(`
CREATE TABLE IF NOT EXISTS edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_word TEXT,
  to_word TEXT
);
`);

// 反向边（查询优化）
db.exec(`
CREATE TABLE IF NOT EXISTS reverse_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_word TEXT,
  to_word TEXT
);
`);

module.exports = db;