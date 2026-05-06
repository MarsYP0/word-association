const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ========================
// 1. 假数据（先不用数据库）
// ========================
const wordData = {
  sun: {
    meaning: "太阳",
    associations: ["light", "heat", "sky", "summer"]
  },
  apple: {
    meaning: "苹果",
    associations: ["fruit", "red", "sweet", "tree"]
  }
};

// ========================
// 2. API：查询单词
// ========================
app.get("/word", (req, res) => {
  const text = req.query.text;

  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }

  const data = wordData[text];

  if (data) {
    return res.json({
      word: text,
      meaning: data.meaning,
      associations: data.associations
    });
  }

  // 没有就返回默认值
  return res.json({
    word: text,
    meaning: "（暂无释义）",
    associations: []
  });
});

// ========================
// 3. 启动服务
// ========================
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});