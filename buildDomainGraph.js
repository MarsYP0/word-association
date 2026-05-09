require("dotenv").config();
const db = require("./db");
const { generateAssociations } = require("./ai");

const DOMAIN_CONFIG = {
  cloud: {
    name: "Cloud Computing",
    slug: "cloud",
    description: "云计算基础设施、平台与服务",
    color: "#4A90D9",
    wikiCategories: ["Cloud_computing", "Cloud_platforms", "Cloud_infrastructure"],
    seedWords: [
      "cloud computing", "virtual machine", "container", "Kubernetes", "Docker",
      "serverless", "microservices", "load balancer", "CDN", "IaaS", "PaaS", "SaaS",
      "DevOps", "API gateway", "autoscaling", "availability zone",
      "object storage", "message queue", "service mesh", "cluster",
      "orchestration", "deployment", "pipeline", "replica", "pod"
    ]
  },
  ai: {
    name: "Artificial Intelligence",
    slug: "ai",
    description: "人工智能、机器学习与深度学习",
    color: "#9B59B6",
    wikiCategories: ["Artificial_intelligence", "Machine_learning", "Deep_learning"],
    seedWords: [
      "machine learning", "neural network", "deep learning", "natural language processing",
      "computer vision", "training data", "model", "inference", "algorithm", "dataset",
      "transformer", "large language model", "reinforcement learning", "classification",
      "gradient descent", "overfitting", "embedding", "attention mechanism",
      "fine-tuning", "prompt", "hallucination", "tokenization", "backpropagation",
      "convolutional neural network", "generative AI"
    ]
  }
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function saveNodeWithAI(word) {
  const existing = db.prepare(`SELECT to_word FROM edges WHERE from_word = ?`).all(word);
  if (existing.length >= 5) {
    console.log(`  [cache] ${word}`);
    return;
  }

  console.log(`  [ai]    ${word} ...`);
  try {
    const result = await generateAssociations(word);
    const { definition, associations } = result;

    db.prepare(`
      INSERT INTO nodes (word, definition) VALUES (?, ?)
      ON CONFLICT(word) DO UPDATE SET definition = COALESCE(excluded.definition, definition)
    `).run(word, definition);

    for (const { word: w, type, definition: wDef } of associations) {
      db.prepare(`
        INSERT INTO nodes (word, definition) VALUES (?, ?)
        ON CONFLICT(word) DO UPDATE SET definition = COALESCE(excluded.definition, definition)
      `).run(w, wDef || null);
      db.prepare(`INSERT OR IGNORE INTO edges (from_word, to_word, relation_type) VALUES (?, ?, ?)`).run(word, w, type);
      db.prepare(`INSERT OR IGNORE INTO reverse_edges (from_word, to_word, relation_type) VALUES (?, ?, ?)`).run(w, word, type);
    }
  } catch (e) {
    console.warn(`  Error generating "${word}": ${e.message}`);
  }
}

async function buildDomain(slug) {
  const config = DOMAIN_CONFIG[slug];
  if (!config) {
    console.error(`Unknown domain slug: "${slug}". Available: ${Object.keys(DOMAIN_CONFIG).join(", ")}`);
    process.exit(1);
  }

  console.log(`\n=== Building domain: ${config.name} ===`);

  db.prepare(`
    INSERT INTO domains (name, slug, description, color)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET name = excluded.name, description = excluded.description, color = excluded.color
  `).run(config.name, config.slug, config.description, config.color);

  const domain = db.prepare(`SELECT id FROM domains WHERE slug = ?`).get(config.slug);

  const allTerms = [...config.seedWords];
  console.log(`\nTotal unique terms: ${allTerms.length}`);
  console.log(`Generating associations (this may take a while)...\n`);

  let done = 0;
  for (const term of allTerms) {
    await saveNodeWithAI(term);
    db.prepare(`INSERT OR IGNORE INTO node_domains (word, domain_id) VALUES (?, ?)`).run(term, domain.id);
    // Also tag the 5 AI-generated neighbors so they appear in the domain graph
    const neighbors = db.prepare(`SELECT to_word FROM edges WHERE from_word = ?`).all(term);
    for (const { to_word } of neighbors) {
      db.prepare(`INSERT OR IGNORE INTO node_domains (word, domain_id) VALUES (?, ?)`).run(to_word, domain.id);
    }
    done++;
    if (done % 5 === 0) console.log(`  --- ${done}/${allTerms.length} done ---`);
    await sleep(1500);
  }

  const total = db.prepare(`SELECT COUNT(*) as c FROM node_domains WHERE domain_id = ?`).get(domain.id);
  console.log(`\nDone! Domain "${config.name}" now has ${total.c} tagged terms.`);
}

const slug = process.argv[2];
if (!slug) {
  console.log(`Usage: node buildDomainGraph.js <slug>`);
  console.log(`Available: ${Object.keys(DOMAIN_CONFIG).join(", ")}`);
  process.exit(0);
}

buildDomain(slug).catch(e => { console.error(e); process.exit(1); });
