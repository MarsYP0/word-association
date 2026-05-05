const axios = require("axios");

async function generateAssociations(word) {
  const prompt = `
给单词 "${word}" 生成5个生活中最自然联想词。
要求：
- 常见词
- 简单
- 英文
- 用逗号分隔
`;

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    }
  );

  return res.data.choices[0].message.content
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

module.exports = { generateAssociations };