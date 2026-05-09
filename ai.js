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

async function generateDomainSeeds(domainName) {
  const prompt = `You are a domain knowledge expert. The user wants to learn vocabulary for the domain: "${domainName}".
Generate exactly 25 key technical terms/concepts for this domain.
Return ONLY a JSON object:
{
  "slug": "short-english-identifier (lowercase, letters and hyphens only, max 20 chars)",
  "seeds": ["term1", "term2", ..., "term25"]
}
Rules:
- slug: a concise English identifier for this domain (e.g. "blockchain", "cloud-computing")
- seeds: specific technical concepts, tools, frameworks, or techniques in this domain
- use common English terms even if the domain name is in another language
- lowercase, concise (1-4 words each)
- cover fundamentals, core tools, and advanced concepts`;

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    },
    { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
  );

  return JSON.parse(res.data.choices[0].message.content);
}

module.exports = { generateAssociations, generateDomainSeeds };