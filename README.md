# 骏龙医疗官网项目

这是霸州市骏龙医疗器械有限公司官网项目，包含静态前端页面、产品展示、登录鉴权、员工管理后台和一个 Node.js 本地服务端。

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

## 后端如何运行

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

## 环境变量

当前项目只使用可选环境变量：

```text
PORT=
```

`.env.example` 仅作为变量说明。当前 `server.js` 不会自动加载 `.env` 文件；如需使用 `.env`，请在部署平台中配置环境变量，或后续引入 dotenv 等加载方式。

## 数据和安全注意事项

- `data/*.json` 是本地运行期数据，可能包含账号密码哈希、客户电话、订单、库存等信息，已通过 `.gitignore` 排除，不会提交到 GitHub。
- `assets/` 是官网展示所需静态资源和产品图片，应该提交。
- 不要提交 `.env`、数据库文件、日志、缓存、`node_modules/`、虚拟环境等本地文件。
- 当前代码中保留了本地演示账号提示和首次运行种子账号逻辑。生产部署前请务必改为强密码和更安全的账号初始化方式。

## 常用命令

```bash
npm start
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
