# Drover Superagent 实施与验收报告

更新时间：2026-10-31T20:13:02.826Z（UTC；本地日期 2026-11-01）。

实现、接线和相关检查已完成；真实端到端 **5/6 通过，1/6 被微信登录状态阻塞**。尚不能声明全部验收通过。已 fetch、合入并推送最新 main（1233751cd3831edc8f32c09fad25bc21be380da7），官方 release 已暂存且 prepared 预检通过。**没有激活正式 3001。**

## 实现与迁移数字

- 上游固定 deepseek-ai/dsh-superagent-prototype@6337fc823ce20251c8de8085948165c81aaa701e，MIT 许可随代码保留。core 15 个文件去 CRLF 后与上游逐字相同；领域语义不改。原内核测试与 SQLite 适配测试均执行。
- 单写者 SQLite Store、schema 版本、Effects/Outbox、启动恢复、owner/admin API、loopback 执行能力及退出排空已接线。默认 disabled、observe，正式实例不会因打包自动启用。
- 四个 Source 已实现：GitHub 增量 issue/评论、飞书独立 bot 事件流及历史/话题补读、微信本地数据库、已迁移监测 probe。入站先核对内部出站账本，再做准入及上游处理；已订阅线程也不能绕过 allow-list。
- 旧任务扫描 **28 个 tasks.json、1182 个任务**；导入 **7 个监测**，合计 **1189 Ticket**。重复运行新增 0/跳过 1189；回滚移除 1189/保留 0，再导入 1189。只对 3014 独立副本执行。
- 迁移不写旧 tasks.json。读回哈希 27/28 一致；ras-realign-crlb 的文件发生并发漂移，未调查出写入者，不宣称全部文件哈希相同。隔离测试证明迁移/回滚保留源文件字节；旧文件未删除。已在运行的监测会延后迁移，避免重复副作用。
- 默认 Codex gpt-6.1-sol/high 执行、gpt-6-luna 研判；每 Ticket 独立目录，映射仓库使用 worktree。默认 4 槽加人工消息槽。Claude SDK/DSH 工具通道已接线，但本轮真实任务仅验证 Codex，不宣称其他两种提供方也通过 live E2E。
- 提示词 CAS 版本化/历史恢复、中英任务面板、attention 优先、健康任务折叠、来源与准入/模型配置、Outbox 不确定发送核对入口已实现。

## 六项真实端到端

| 项 | 结果 | 可核验事实 |
|---|---|---|
| 飞书 | 通过 | 本人 user 给 bot 私聊点名→Trigger/Eval/Ticket→Codex 写入并读回 SA_FEISHU_OK→原 chat 两条原文回复；平台读回发送者为本人 user |
| 微信 filehelper | **外部阻塞** | 实际发送预检及最终 readiness 均 exit 2 ambiguous_window，发现 mmui::LoginWindow + mmui::XDialog；没有发送，也没有伪造 Ticket/回复 |
| 监测 | 通过（修复后重跑） | a2a6d587-b596-464b-803b-1ec9dbed60e2 的 probe→原订阅 Ticket 4ea19fa45e67e141afd6770e0a450150→worker 唤醒→写入并读回 SA_MONITOR_FIXED_OK；新增 legacy Ticket=0 |
| 非白名单 | 通过（修复后重跑） | 已订阅 GitHub 线程上构造 human=true/false 两条真实 HTTP Trigger，均 filtered/not_a_member、fanout=[]；Ticket 与 Assignment 数不变 |
| 进行中重启 | 通过 | STARTED 写出后关闭 3014，再启动；旧 Assignment endedReason=hostRestarted，新 Assignment ready；STARTED mtime 保留，Outbox 六条发送记录保持，未重发 |
| GitHub 本人账号 | 通过 | WGeorgezzzz/drover 测试 issue #1→确认→真实写入/读回 SA_GITHUB_OK→结果；真人追加也受理；含“驭手”的出站回读被识别 own_outbound，无新 Ticket；issue 已关闭 |

每项截图在 evidence/{feishu,wechat,monitor,denied,restart,github}.png；微信截图只显示缺少对应 Ticket，不作为成功证据。真实任务完整日志在 copy-home 的会话/执行日志和 server-3014.log，结构化证据见 evidence/acceptance.json 与各 *-result.json。浏览器 pageerror=0。原始任务和历史会话含用户数据，只在本地保留；提交仓库的 acceptance.json 仅含测试摘要。

## 本人身份与出站

GitHub 只接 WGeorgezzzz/drover、allow-list WGeorgezzzz，复用本人 gh keyring。飞书接收 bot、发送明确 --as user；本人 open_id ou_6d5c3f4bef3510b36049813bf38848d1。微信初始账号 wangqiaozhi123。三种渠道均按原文发送，**不加前缀、隐藏标记或其他标识**。

Outbox 先落库、按会话有序发送，成功写回平台 ID；微信记录会话+发送者+内容哈希+发送时间。人和驭手账号相同也不会吞掉本人新请求。发送已开始但响应/落账不确定时挂起供平台读回及人工核对，不盲目重发；这保留安全性，但跨崩溃不承诺平台 exactly-once。飞书有 idempotency-key；GitHub/微信不确定状态需核对后 resolve。

## 实测失败、修复与证据边界

1. conhost 的 stdio=ignore 会退出且实际子程序不执行。改用 pipe 并持续排空，在同样无窗口条件下真实 Codex 完成任务。
2. 上游核心会先向订阅 Ticket fanout，宿主仅 gate Eval 不足以拒绝陌生人。增加 SourceIngress 前置准入并保留拒绝 disposition；core 不改。新增 SQLite ended-thread human/nonhuman 回归和真实重跑。
3. 初次监测案例发生 master 使用兼容创建入口、产生重复 legacy Ticket，不能作验收成功。master 原生 monitor 限只读、移除绕开槽位的 session bridge、主会话创建回调不全量迁移；修复后新建独立案例从 waiting 到原 Ticket ready，新增 legacy=0。早期失败 Ticket/日志保留，测试监测停止。
4. 监测第一次检查器要求文件严格无尾换行，任务本身未禁止换行；实际 worker 读回成功。独立检查明确允许一个尾换行，保存原始输出与检查器失败。重启检查器也修复了生成正则换行、启动就绪竞态等脚本错误，最终独立证明 hostRestarted/mtime/Outbox；不把检查器错误当作产品成功。
5. 合并前 **253/253** 相关测试、前后端 typecheck、lint、前端 build 均退出 0（verification-premerge.json）。合并 de28d277 的三项更新后重新执行：相关测试 253/253、前后端 typecheck、前端 build 仍通过；全 src/server lint 退出 1，共 **6 条继承自 main 下载功能的 error**，6 个文件逐字等于 origin/main。对本任务 59 个变更文件 lint 退出 0，见 lint-owned-result.json。未修改无关代码，未将错误算成通过，也未套用题述旧四个测试失败豁免。完整日志 verification.json、lint-verified.log、lint-owned-verified.log。

## 偏离上游

- 用户补充优先：全部用本人身份、原文出站，替代上游专用账号及基于账号的 self-filter；防循环在宿主 Outbox 内部账本完成。
- SQLite 复用 Drover better-sqlite3；九个领域表加版本与键值持久化，列布局按宿主适配，未照搬上游 active working-set 的生成列优化。Effects/Outbox 用事务持久化；领域语义不变。
- 采用 Drover provider-runtime、现有 monitor 工具和管理面板；主会话只研判派单、worker 负责副作用。兼容 monitor 事件映射为原 Ticket 订阅。
- 宿主 SourceIngress 增加前置 allow-list 防止已订阅线程先 fanout，属于端口层安全边界；固定上游 core 保持原样。
- TypeScript lib ES2023/rewriteRelativeImportExtensions 支持上游 findLast/.ts 引用；本地 Node 24.18.0。
- 不确定发送进入人工核对，未加入自动跨平台读回恢复。此限制明确显示并测试，不声称无条件 exactly-once。

## 用户后台与账号操作

飞书本轮实际接收/历史读取及 user 发送成功，没有经核验必须新增的后台权限或事件订阅，因此无待办后台操作。独立 bot 配置在 copy-home/feishu-bot；不操作用户浏览器、不删除共享 keychain 凭据。旧 InboxAgentFeishuBridge 本轮未停用：3014 独立 bot 配置未发现抢流需停的实际冲突。正式切换前若与旧桥接发生冲突，应暂停旧计划任务并记录原配置；恢复时先停 superagent bot 消费，再恢复旧任务，避免并发消费。

GitHub 不需要新 agent 账号、gh-agent 配置或登录步骤。测试 issue #1 已关闭。唯一必须由用户完成的外部步骤：**在当前微信客户端完成本人登录，并处理遮挡/歧义弹窗，使 filehelper 可用**。不替用户扫码、不切账号、不重启微信。数据库历史可读不代表 UIA 实时收发可用。

## 回滚与继续

- 本轮只操作测试副本、feature 分支及 release 暂存；3001 未激活，所以正式服务无需回滚。
- 测试恢复入口：以 conhost.exe --headless node.exe D:/embodied/droversuperagent-20261101/launch-staged-test.cjs 启动暂存产物的 3014，等待 /api/superagent 完成初始化。保留 copy-home/auth.db、Outbox、配置、会话和备份；不得清空账本后重发已完成的测试。
- 在线迁移 API：owner/admin 认证后 POST /api/superagent/migration/preview、/apply、/rollback，body={roots:[...] }；apply/rollback 先创建 .superagent-*.bak。rollback 只撤销未被执行/修改的导入记录，保留已有活动记录，恢复兼容监测所有权；不恢复或删除 tasks.json。
- 离线 CLI（必须先排空并停止目标实例，显式给数据库）：node scripts/superagent-migrate.mjs --database <copy/auth.db> --root <原任务根目录>；先 preview，再追加 --apply；回滚用 --rollback。活 writer 锁会拒绝离线操作。备份恢复仅在停服务后针对明确目标副本执行。
- 正式启用后的业务回滚：先暂停来源/主会话并排空，核对不确定 Outbox，运行迁移 rollback；需要保留的已执行 Ticket 留档。程序版本回切必须使用仓库部署守卫和已验证备份，不能盲目删除新表或旧任务。
- 合并和暂存均已完成，见下一节；不运行 --activate，不更改正式后台任务或桌面壳。


## main、暂存与收尾结果

- main 已推送 1233751cd3831edc8f32c09fad25bc21be380da7，包含 runtime、四 Sources/Outbox、迁移回滚、执行器/提示词/面板及真实 E2E 修复。origin/main 上游三项并发更新均保留，无 force push。feature 分支 feat/droversuperagent-20261101 另保留最终报告/状态提交；原始脏 main 工作区未修改。
- 从独立且干净的 release-source（detached origin/main）执行 **官方** node scripts/deploy/stage-release.cjs D:/embodied/droversuperagent-20261101/release-1。未安装大型依赖；node_modules 复用现有 junction，task-local build-bin 只提供缺失的 npm .bin 启动入口，不跳过官方构建或守卫。
- release-1/build-provenance.json、frontend-release.json 和 release-manifest.json 均指向 1233751cd3831edc8f32c09fad25bc21be380da7；**1258** 项哈希验证成功，桌面壳清单完整。
- 执行官方 activate-release.cjs --source <release-source> --release <release-1>，**没有 --activate 或 --rollback**。prepared 检查通过：全局锁、当前 main 相等、干净源、祖先关系、provenance、全部哈希、功能标志和桌面壳核对；productionChanged=false。这只是准备检查，不代表用户授权切换正式服务。
- 暂存产物还在 3014/原独立副本实际启动：1196 Ticket=1189 导入+7 个保留的测试历史，Assignment 1199，active=[]，Outbox 6→6，平台收据 ID 不变。更新全部六张截图，pageerror=0，再优雅关闭并排空。测试实例已停；resume 时使用 launch-staged-test.cjs。两个测试监测 stopped；GitHub 测试 issue 已关闭。
- 正式配置在预检前后 SHA256 相同。本任务未激活/切换 3001，也未更新正式桌面壳。同期其他任务已将正式 runtime 更新到 drover-mobile-download-20261101/release-28，这是观测到的外部状态，不宣称本任务让整个机器保持静止。
- 仍未满足的内容：微信真实 filehelper 端到端（登录阻塞），以及合并后全 src/server lint 的六条上游错误。后者没有被隐瞒或擅自修改；本任务 59 个变更文件 lint 和 253 项相关测试通过。

## 登录后的最小续做范围

1. 用户完成当前微信本人登录并处理 XDialog，先确认 readiness --backend uia 能定位已登录主窗口。不得替用户扫码或换账号。
2. 通过 conhost --headless 启动 launch-staged-test.cjs，等待认证 /api/superagent 返回快照；复用现有独立 copy-home，不能重置 DB/Outbox。
3. 仅执行真实微信 filehelper 点名请求（e2e-control.cjs wechat），等待 Trigger→Eval accept→Ticket→Codex 写入并读回 SA_WECHAT.txt。确认原会话本人原文的 ack/result，包含“驭手”的回复不会新建 Ticket；保存平台/数据库回读和新截图。不得用构造 Trigger 代替本项。
4. 跟进 main 下载功能的六条 lint 错误；若 main 有上游修复，fetch/合入后重跑合并后检查，并从干净当前 main 重新官方 stage，仍不 activate。不可将 exit 1 改记成通过。
5. 仅在全部六项真实链路和约定检查达标后更新 STATUS/REPORT/DONE；原失败、跳过、检查器错误和外部阻塞证据继续保留。
