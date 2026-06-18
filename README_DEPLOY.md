# 腾讯云生产部署说明

本文档用于把轮椅公司官网部署到腾讯云 Linux 服务器。部署方式为：Nginx 直接托管前端静态文件，`/api/` 反向代理到本机 FastAPI 服务 `127.0.0.1:8000`。

## 1. 服务器准备

以 Ubuntu 为例：

```bash
sudo apt update
sudo apt install -y nginx python3 python3-venv
sudo mkdir -p /var/www/wheelchair
sudo chown -R www-data:www-data /var/www/wheelchair
```

把项目文件上传到：

```text
/var/www/wheelchair
```

不要上传 `.env` 到公开仓库。`data/*.json` 是运行期数据，如果需要保留本地订单、员工、库存和客户资料，请用安全方式单独上传到 `/var/www/wheelchair/data/`。

## 2. 配置环境变量

在服务器创建 `/var/www/wheelchair/.env`：

```bash
sudo cp /var/www/wheelchair/.env.example /var/www/wheelchair/.env
sudo nano /var/www/wheelchair/.env
```

至少配置：

```text
DATA_DIR=/var/www/wheelchair/data
SESSION_MAX_AGE_SECONDS=28800
COOKIE_SECURE=0
ADMIN_INITIAL_PASSWORD=请改成强密码
CUSTOMER_INITIAL_PASSWORD=请改成强密码
STAFF_INITIAL_PASSWORD=请改成强密码
DASHSCOPE_API_KEY=
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
```

启用 HTTPS 后，把 `COOKIE_SECURE=1`。

## 3. 安装 Python 依赖

```bash
cd /var/www/wheelchair
sudo -u www-data python3 -m venv .venv
sudo -u www-data .venv/bin/pip install --upgrade pip
sudo -u www-data .venv/bin/pip install -r requirements.txt
```

检查 FastAPI 能否启动：

```bash
sudo -u www-data /var/www/wheelchair/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
```

另开一个终端测试：

```bash
curl http://127.0.0.1:8000/api/health
```

确认返回 `{"status":"ok"}` 后按 `Ctrl+C` 停止测试进程。

## 4. 配置 systemd 后台服务

```bash
sudo cp /var/www/wheelchair/deploy/wheelchair-backend.service /etc/systemd/system/wheelchair-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now wheelchair-backend
sudo systemctl status wheelchair-backend
```

查看日志：

```bash
sudo journalctl -u wheelchair-backend -f
```

## 5. 配置 Nginx

编辑 `deploy/nginx-wheelchair.conf`，把 `server_name example.com www.example.com;` 改成你的备案域名。

```bash
sudo cp /var/www/wheelchair/deploy/nginx-wheelchair.conf /etc/nginx/sites-available/wheelchair.conf
sudo ln -sf /etc/nginx/sites-available/wheelchair.conf /etc/nginx/sites-enabled/wheelchair.conf
sudo nginx -t
sudo systemctl reload nginx
```

访问：

```text
http://你的域名/
```

## 6. HTTPS 建议

生产环境建议配置 HTTPS。启用 HTTPS 后：

```bash
sudo nano /var/www/wheelchair/.env
```

把：

```text
COOKIE_SECURE=1
```

然后重启后端：

```bash
sudo systemctl restart wheelchair-backend
```

## 7. 上线前检查

```bash
cd /var/www/wheelchair
python3 -m py_compile main.py chat_backend.py product_search.py requirement_parser.py
curl http://127.0.0.1:8000/api/health
sudo nginx -t
sudo systemctl status wheelchair-backend
```

浏览器检查：

- 首页、手动轮椅、电动轮椅、工厂介绍页图片是否正常。
- 登录页能否登录。
- 员工后台能否查看和维护销售单、配件、成品、客户资料。
- 智能客服能否返回推荐。
- 页面底部 ICP 备案号链接能否打开，公安备案号位置已预留。

## 8. 注意事项

- 不要把 `.env`、`data/*.json`、数据库备份、日志、虚拟环境目录上传到公开仓库。
- 如果曾经把 `.env` 暴露到可访问目录，立即轮换 DashScope API Key 和后台账号密码。
- 当前登录会话保存在 FastAPI 进程内存中，systemd 服务使用 `--workers 1`，不要随意改成多 worker；如后续需要多进程，请改用 Redis 或数据库保存会话。
