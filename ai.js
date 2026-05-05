const axios = require("axios");

async function generateAssociations(word) {
  const prompt = `For the English word "${word}", return ONLY a JSON object (no markdown, no extra text):
{
  "definition": "中文释义（含词性，如：n. 苹果；v. 奔跑）",
  "associations": [
    {"word": "english_word", "type": "synonym", "definition": "关联词中文释义（含词性）"}
  ]
}
Rules:
- definition: concise Chinese explanation of "${word}" with part of speech
- associations: exactly 5 items using common English words
- each association must include its own "definition" field (concise Chinese with part of speech)
- type must be one of: synonym(近义词), antonym(反义词), collocation(常用搭配), hypernym(上位词), hyponym(下位词)`;

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    }
  );

  return JSON.parse(res.data.choices[0].message.content);
}

module.exports = { generateAssociations };