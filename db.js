const Database = require("better-sqlite3");

const db = new Database("words.db");

db.exec(`
CREATE TABLE IF NOT EXISTS nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT UNIQUE,
  definition TEXT
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_word TEXT,
  to_word TEXT,
  relation_type TEXT
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS reverse_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_word TEXT,
  to_word TEXT,
  relation_type TEXT
);
`);

// 兼容旧数据库：新增字段
try { db.exec(`ALTER TABLE nodes ADD COLUMN definition TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE edges ADD COLUMN relation_type TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE reverse_edges ADD COLUMN relation_type TEXT`); } catch(e) {}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS user_graphs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  root_word TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, root_word)
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS user_word_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  word TEXT,
  mastered INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, word)
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS user_excluded_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  from_word TEXT,
  to_word TEXT,
  UNIQUE(user_id, from_word, to_word)
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS user_excluded_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  word TEXT,
  UNIQUE(user_id, word)
);
`);

module.exports = db;