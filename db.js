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

module.exports = db;