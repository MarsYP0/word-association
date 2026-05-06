# Word Graph — 英语词汇联想图谱

一个基于 AI 的英语词汇学习工具。输入一个英文单词，自动生成它的联想词网络，并以可交互的图谱形式呈现，帮助通过词汇关联记忆学习英语。

## 功能特性

- **AI 词汇联想**：输入词根，调用 GPT-4o-mini 自动生成近义词、反义词、搭配词、上下位词等多种关联词，附带中文释义
- **可交互图谱**：基于 Cytoscape.js 的词汇关系网络，边按关系类型着色，点击节点查看释义
- **我的图谱**：将所有探索过的词汇汇聚成一张个人词汇网络，支持拖动图例、编辑/删除词与边、手动新增词汇和关联
- **词汇库**：查看所有收录单词，支持搜索、按掌握状态筛选、统计掌握率
- **单词复习**：翻转卡片式复习，随机抽卡，标记已掌握/未掌握，显示进度
- **多用户支持**：JWT 登录注册，每位用户拥有独立的词汇库、学习进度和图谱视图
- **AI 缓存**：同一个词只调用一次 OpenAI API，结果全局共享，节省费用

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Node.js + Express 5 |
| 数据库 | SQLite（better-sqlite3） |
| AI | OpenAI GPT-4o-mini |
| 图谱可视化 | Cytoscape.js |
| 认证 | JWT（jsonwebtoken）+ bcryptjs |
| 前端 | 原生 HTML / CSS / JavaScript |

## 环境要求

- **Node.js** v18 或以上（推荐 v20 LTS）
- **npm**（随 Node.js 一起安装）
- **OpenAI API Key**（用于生成词汇联想）

### 安装 Node.js

前往 [https://nodejs.org](https://nodejs.org) 下载安装包：
- 选择 **LTS** 版本（长期支持版）
- 安装完成后在终端运行以下命令确认安装成功：

```bash
node -v   # 应输出 v18.x.x 或更高
npm -v    # 应输出版本号
```

## 快速开始

**1. 克隆项目**

```bash
git clone <your-repo-url>
cd word-association
```

**2. 安装依赖**

```bash
npm install
```

**3. 配置环境变量**

在项目根目录创建 `.env` 文件：

```env
OPENAI_API_KEY=your_openai_api_key_here
JWT_SECRET=any_random_string_as_your_secret
```

- `OPENAI_API_KEY`：在 [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys) 获取
- `JWT_SECRET`：任意字符串即可，用于签发用户登录 Token，例如 `my-secret-123`

**4. 启动服务**

```bash
node app.js
```

打开浏览器访问 [http://localhost:3000](http://localhost:3000)

> 数据库文件 `words.db` 会在首次启动时自动创建，无需手动配置。

## 项目结构

```
word-association/
├── app.js            # Express 服务器与所有 API 路由
├── auth.js           # JWT 认证中间件、注册/登录路由
├── ai.js             # OpenAI 调用，生成词汇联想与释义
├── graphService.js   # 核心图谱逻辑（缓存、存储、查询）
├── db.js             # SQLite 数据库 Schema（8 张表）
├── index.html        # 首页：生成词汇联想图谱
├── login.html        # 注册 / 登录页
├── dashboard.html    # 我的词汇库
├── mygraph.html      # 我的图谱（全局词汇网络）
├── review.html       # 单词复习（翻转卡片）
├── .env              # 环境变量（不提交到 Git）
└── words.db          # SQLite 数据库文件（自动生成）
```

## 使用说明

1. **注册/登录**：首次访问自动跳转登录页，注册账号后登录
2. **生成图谱**：在首页输入英文单词，点击 Generate，AI 自动生成关联词网络
3. **查看释义**：点击图谱中任意节点，右侧面板显示中文释义，可标记为已掌握
4. **我的图谱**：查看所有词汇的完整关联网络；可拖动图例、修改边的关系类型、删除边或词、手动新增词汇
5. **词汇库**：进入「我的词汇」管理所有收录单词，支持搜索、筛选、删除
6. **复习单词**：用翻转卡片复习词汇，按掌握情况分类练习

## API 路由

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/register` | 注册 |
| POST | `/login` | 登录 |
| GET | `/graph` | 生成/获取单词联想图谱 |
| GET | `/user/words` | 获取用户词汇列表 |
| DELETE | `/user/words` | 删除单词 |
| GET | `/user/graph-data` | 获取完整词汇网络数据 |
| POST | `/user/add-word` | 手动新增词汇 |
| POST | `/user/add-edge` | 新增词间关联 |
| PUT | `/edges` | 修改关联类型（用户级，不影响其他用户） |
| DELETE | `/edges` | 删除关联（用户级） |
| POST | `/user/progress` | 更新单词掌握状态 |

## Edge 关系类型

| 类型 | 含义 | 颜色 |
|---|---|---|
| synonym | 近义词 | 蓝色 |
| antonym | 反义词 | 红色 |
| collocation | 搭配 | 橙色 |
| hypernym | 上位词 | 紫色 |
| hyponym | 下位词 | 绿色 |
| related | 相关 | 灰色 |

## .gitignore 建议

发布到 GitHub 前，建议在项目根目录创建 `.gitignore` 文件以避免敏感信息泄露：

```
.env
words.db
node_modules/
```

## License

MIT
