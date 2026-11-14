# 飞书常驻收件箱适配

沿用现有 `inbox-agent-20261022` 的 owner-only 身份检查、lark-cli 和计划任务。本模块不处理待办整理，不新增待办 A/B/C 卡片。

- `always_on.py`：本地 SQLite 收件/发件身份、快速持久化、Drover 入队、真实历史回读、待决卡片及文本答复。
- `lark_worker.py`：桌面包鉴权环境内执行 CLI；后台进程使用 `conhost.exe --headless`，保留 stdin 管道。
- `bridge.patch`：接入现有桥接的改动；应用前先备份 `bridge.py` 和 `config.json`，确认 bridge.log 没有执行中的旧会话，使用原 stop.ps1/start.ps1 重启。

配置添加 `always_on_enabled: true`、`always_on_api: "http://127.0.0.1:3001"`。复制这两个 Python 文件到桥接目录，应用补丁。保留现有 owner_open_id、鉴权及其他配置；不把密钥放进仓库。功能关闭时服务器返回 enabled=false，新消息回到旧桥接，已持久化消息保留。

审批卡片包含问题、来源、显式选项及 `批 <短id> <答复>` 文本兜底。没有默认答复。2026-11-14 已验证真实交互卡发送、真实文本答复和同会话恢复；card.action.trigger 消费器出现 ready，但尚未验证真实点击回调。如果按钮没有响应，在飞书开发者后台“事件与回调 / 回调配置”确认订阅 card.action.trigger、回调连接及应用发布，再实际点击验证。ready 不能代替点击验收。

CLI 使用源消息 ID 和稳定 idempotency-key；飞书远端幂等窗口约一小时，因此跨越该窗口的远端成功/本地提交间崩溃仍可能重复发出通知。模型执行去重使用 Drover 收件箱与持久 provider 回执，保留不确定结果供人工核对。
