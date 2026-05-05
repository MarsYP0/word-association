const db = require("./db");
const { generateAssociations } = require("./ai");

// 存节点
function saveNode(word) {
  db.prepare(`
    INSERT OR IGNORE INTO nodes (word)
    VALUES (?)
  `).run(word);
}

// 存边
function saveEdge(from, to) {
  db.prepare(`
    INSERT INTO edges (from_word, to_word)
    VALUES (?, ?)
  `).run(from, to);

  // 👉 反向索引
  db.prepare(`
    INSERT INTO reverse_edges (from_word, to_word)
    VALUES (?, ?)
  `).run(to, from);
}

// 查邻居
function getNeighbors(word) {
  const forward = db.prepare(`
    SELECT to_word FROM edges WHERE from_word = ?
  `).all(word);

  const reverse = db.prepare(`
    SELECT to_word FROM reverse_edges WHERE from_word = ?
  `).all(word);

  return [...forward, ...reverse];
}

// 主逻辑：获取词 + AI + 存图
async function getWordGraph(word) {
  saveNode(word);

  const edges = getNeighbors(word);

  // ❗ 只有完全没有关系才调用AI
  if (edges.length < 5) {
    const associations = await generateAssociations(word);

    for (const w of associations) {
      saveNode(w);
      saveEdge(word, w);
    }

    return {
      word,
      from: "ai",
      associations
    };
  }

  return {
    word,
    from: "cache",
    associations: edges.map(e => e.to_word)
  };
}

// 图结构（给前端）
function getGraph(word) {
  const edges = getNeighbors(word);

  const nodes = [{ data: { id: word } }];
  const edgeList = [];

  for (const e of edges) {
    nodes.push({ data: { id: e.to_word } });
    edgeList.push({
      data: {
        source: word,
        target: e.to_word
      }
    });
  }

  return [...nodes, ...edgeList];
}

module.exports = {
  getWordGraph,
  getGraph
};