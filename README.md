# 骏龙医疗官网项目

这是霸州市骏龙医疗器械有限公司官网项目，包含静态前端页面、产品展示、登录鉴权、员工管理后台、Node.js 本地服务端和 FastAPI 聊天测试接口。

## 项目结构

```text
.
├── index.html          # 官网首页
├── electric.html       # 电动轮椅产品页
├── manual.html         # 手动轮椅产品页
├── factory.html        # 工厂介绍页
├── login.html          # 统一登录页
├── staff.html          # 员工管理后台页面
├── server.js           # Node.js 后端服务和 API
├── chat_backend.py     # FastAPI 智能客服测试接口
├── requirement_parser.py # 智能客服用户需求解析框架
├── product_search.py   # 智能客服临时产品规则检索
├── products.json       # 临时测试产品数据，后续可替换为真实产品数据
├── requirements.txt    # Python 聊天后端依赖
├── backend.js          # 员工后台前端交互逻辑
├── auth.js             # 官网登录状态前端逻辑
├── *.css / *.js        # 公共样式和前端组件
├── assets/             # 官网展示图片、产品图片、二维码等静态资源
└── data/               # 本地运行期数据目录，JSON 数据不提交到 GitHub
```

## 前端如何运行

前端页面可以由 `server.js` 静态托管，推荐通过本地服务访问，不要直接双击 HTML 文件：

```bash
npm start
```

然后在浏览器打开：

```text
http://localhost:3000/index.html
```

## Node 后端如何运行

本项目后端使用 Node.js 内置模块实现，不依赖外部 npm 包。

```bash
npm start
```

默认端口为 `3000`。如果需要修改端口，可在启动命令中设置 `PORT`：

```bash
PORT=8080 npm start
```

Windows PowerShell 示例：

```powershell
$env:PORT=8080; npm start
```

## 智能客服后端如何运行

聊天框会请求 FastAPI 接口：

```text
http://localhost:8000/chat
```

首次运行前安装 Python 依赖：

```bash
pip install -r requirements.txt
```

启动聊天测试后端：

```bash
uvicorn chat_backend:app --host 0.0.0.0 --port 8000 --reload
```

当前 `/chat` 接口使用 `requirement_parser.py` 做用户需求解析，再用 `products.json` 做临时规则推荐。4B 阶段已接入阿里云百炼 / DashScope 的通义千问 OpenAI 兼容接口，LLM 只负责解析需求，不负责推荐或编造产品；产品推荐仍然来自 `products.json`。

临时产品推荐数据在：

```text
products.json
```

后续替换真实产品时，保持字段结构不变即可：`id`、`name`、`price`、`category`、`foldable`、`electric`、`lightweight`、`suitable_for`、`image_url`、`description`。

如果 `DASHSCOPE_API_KEY` 缺失、接口报错或 LLM 返回内容无法解析为 JSON，会自动回退到规则解析。后端控制台会打印 `source=llm` 或 `source=rules`，用于判断当前使用的是 LLM 解析还是 fallback。

## 环境变量

当前项目使用这些环境变量：

```text
PORT=
DASHSCOPE_API_KEY=
QWEN_BASE_URL=
QWEN_MODEL=
```

`.env.example` 仅作为变量说明。FastAPI 智能客服后端会从项目根目录的 `.env` 读取 DashScope 配置，`.env` 不要提交到 GitHub。

本地 `.env` 示例：

```text
DASHSCOPE_API_KEY=你的API_KEY
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
```

## 数据和安全注意事项

- `data/*.json` 是本地运行期数据，可能包含账号密码哈希、客户电话、订单、库存等信息，已通过 `.gitignore` 排除，不会提交到 GitHub。
- `assets/` 是官网展示所需静态资源和产品图片，应该提交。
- 不要提交 `.env`、数据库文件、日志、缓存、`node_modules/`、虚拟环境等本地文件。
- 当前代码中保留了本地演示账号提示和首次运行种子账号逻辑。生产部署前请务必改为强密码和更安全的账号初始化方式。

## 常用命令

```bash
npm start
uvicorn chat_backend:app --host 0.0.0.0 --port 8000 --reload
git status
git add .
git commit -m "Initial commit: add full website frontend and backend"
```

## 页面入口

- 官网首页：`/index.html`
- 电动轮椅：`/electric.html`
- 手动轮椅：`/manual.html`
- 工厂介绍：`/factory.html`
- 登录页：`/login.html`
- 员工管理：`/staff.html`
