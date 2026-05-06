const {
  getWord,
  saveWord,
  saveAssociations,
  getAssociations
} = require("./wordRepository");

const { generateAssociations } = require("./ai"); 
// 你之前的AI调用层

async function getWordWithCache(word) {

  // 1️⃣ 查缓存
  const cached = getWord(word);

  if (cached) {
    const associations = getAssociations(word);

    return {
      word,
      meaning: cached.meaning,
      associations,
      source: "cache"
    };
  }

  // 2️⃣ AI生成
  const associations = await generateAssociations(word);

  // 3️⃣ 存数据库
  saveWord(word, "AI generated meaning");
  saveAssociations(word, associations);

  // 4️⃣ 返回
  return {
    word,
    meaning: "AI generated meaning",
    associations,
    source: "ai"
  };
}

module.exports = { getWordWithCache };