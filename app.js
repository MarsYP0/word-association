const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { getWordGraph, getGraph } = require("./graphService");

const app = express();
app.use(cors());

// =========================
// 单词 + AI + 图谱生成
// =========================
app.get("/word", async (req, res) => {
  const word = req.query.text;

  if (!word) {
    return res.status(400).json({ error: "text required" });
  }

  const result = await getWordGraph(word);

  res.json(result);
});

// =========================
// 图结构接口（前端用）
// =========================
app.get("/graph", async (req, res) => {
  const word = req.query.text;
  if (!word) return res.status(400).json({ error: "text required" });

  await getWordGraph(word);
  const graph = getGraph(word);

  res.json({ elements: graph });
});

app.listen(3000, () => {
  console.log("Server running http://localhost:3000");
});