const axios = require("axios");

async function claudeGenerate(prompt) {
  const res = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 200,
      messages: [
        { role: "user", content: prompt }
      ]
    },
    {
      headers: {
        "x-api-key": process.env.CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      }
    }
  );

  return res.data.content[0].text;
}

module.exports = { claudeGenerate };