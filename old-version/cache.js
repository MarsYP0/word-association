const redis = require("redis");

const client = redis.createClient();

client.connect();

// 查缓存
async function getCache(key) {
  const data = await client.get(key);
  return data ? JSON.parse(data) : null;
}

// 写缓存
async function setCache(key, value) {
  await client.set(key, JSON.stringify(value), {
    EX: 60 * 60 * 24 // 24小时
  });
}

module.exports = {
  getCache,
  setCache
};