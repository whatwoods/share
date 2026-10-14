# 湾谷园区运营工作台

湾谷园区综合运营工作台以 **1~19 号楼及公区** 为统一抓手，把 CET 电表能耗数据、日常报修流水和施工遗留专项台账放在同一个界面里。

| 页面 | 数据来源 | 主要功能 |
|---|---|---|
| 今日 `/` | 全部 | 用一句话概括今天要跟进的事；超时工单按责任方分组，一键复制催办消息；楼栋用电异常（昨日 vs 同类日均）；高危遗留 |
| 楼宇 `/buildings` | 全部 | 园区平面图；选中一栋楼，同屏显示该楼用电趋势、在途报修和施工遗留 |
| 能耗 `/energy` | nenghao 服务（只读） | 今日电量、实时负荷、月度累计、光伏、AI 诊断、日趋势、楼栋用电与偏差、分项结构、峰谷热力图、476 个回路台账 |
| 维修 `/repair` | 飞书「日常维修总表」 | 超时催办、在途工单（待处理 / 跟进中）、全部工单检索与导出、考核统计（可排除专项摸排） |
| 遗留攻坚 `/legacy` | 飞书「久拖专项表」 | 高危隐患排行、按施工单位对账（状态分布）、挂账清单、复制对账摘要、导出格式化 Excel 索赔清单 |
| 汇报模式 `/report` | 全部 | 一屏讲清园区运营态势，适合投屏（1920×1080，可全屏） |

全局：按 `⌘K` 或 `/` 搜索工单、遗留和楼栋；右上角可「立即同步」、进入汇报模式。设计规范见 `docs/DESIGN_SYSTEM.md`。

---

## 一键部署（生产）

环境要求：Ubuntu x86_64，Node.js ≥ 22.13（生产用 v26）。不需要 Python，也不需要编译原生模块；数据库使用 Node 内置的 `node:sqlite`。

```bash
# 1. 获取代码
git clone https://github.com/whatwoods/share.git /var/www/wangu-ops
cd /var/www/wangu-ops

# 2. 配置环境变量（至少填 AUTH_PASSWORD、FEISHU_APP_ID、FEISHU_APP_SECRET）
cp .env.example .env && vim .env

# 3. 安装依赖并构建（构建需要 devDependencies，必须完整安装）
npm ci
npm run build

# 4. 先手动同步一次，确认飞书凭证可用（成功退出码 0，失败 1）
npm run sync

# 5. 启动（二选一）
pm2 start ecosystem.config.cjs && pm2 save                  # PM2
# 或 systemd：sudo cp deploy/wangu-ops.service /etc/systemd/system/ && sudo systemctl enable --now wangu-ops
```

服务默认监听 `127.0.0.1:3300`。在 Caddy 中加一段反代即可，示例见 `deploy/Caddyfile.example`：

```
ops.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3300
}
```

健康检查：`curl http://127.0.0.1:3300/api/health` 应返回 `{"ok":true,...}`。

### 更新发布

```bash
git pull && npm ci && npm run build && pm2 restart wangu-ops
```

### 常用命令

| 命令 | 作用 |
|---|---|
| `npm run build` | 构建前端（`dist/web`）和后端（`dist/server`） |
| `npm run start` | 启动生产服务（同时托管 API 和前端页面） |
| `npm run sync` | 立即执行一次飞书同步，然后退出（可配合 cron 或手动排障） |
| `npm run dev` | 本地开发：API 运行在 :3300（热重载），前端运行在 :5173（代理 /api） |
| `npm test` / `npm run typecheck` | 后端单元测试与集成测试 / 前后端类型检查 |

---

## 环境变量

完整说明见 `.env.example`。服务启动时会自动读取仓库根目录的 `.env`；已经存在的系统环境变量优先。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` / `HOST` | `3300` / `127.0.0.1` | 监听地址 |
| `DATA_DIR` | `./data` | SQLite 数据库 `wangu.db` 所在目录，需要可写 |
| `AUTH_PASSWORD` | 空 | 共享访问口令。**留空则关闭登录，仅限本地开发使用** |
| `AUTH_SECRET` | 由口令派生 | Cookie 签名密钥。修改后所有已登录会话失效 |
| `COOKIE_SECURE` | 生产环境为 `true` | 经 Caddy HTTPS 访问时保持 `true`。直接用 http 访问时需设为 `false`，否则登录状态无法保持 |
| `FEISHU_APP_ID` / `FEISHU_APP_SECRET` | 占位值 | 飞书自建应用凭证，需要开通多维表格读权限，并把应用添加为该 Base 的协作者 |
| `FEISHU_BASE_TOKEN` | `FHbvbqfybap1U1sWSNOcZQlvnqh` | 多维表格 app_token |
| `FEISHU_TABLE_DAILY` / `FEISHU_TABLE_LEGACY` | `tbl4m7w4tlwyI9j2` / `tbl27kc7E8IQEEj0` | 日常维修总表 / 久拖专项表 |
| `SYNC_CRON` | `15 6 * * *` | 每天 06:15（北京时间）自动同步，晚于金山 → 飞书的 06:00 同步 |
| `SYNC_INTERVAL_MINUTES` | `0` | 大于 0 时，额外按该间隔（分钟）同步 |
| `NENGHAO_API_BASE` | `http://127.0.0.1:3100` | 现有能耗服务地址 |
| `SOLAR_API_URL` | 空 | 光伏接口地址，留空则使用 `${NENGHAO_API_BASE}/api/solar` |
| `DATA_MODE` | `auto` | `auto`：飞书凭证为空或为占位值时使用演示数据；`live`：强制使用真实数据；`mock`：强制使用演示数据 |

> 安全保护：如果库里已经有真实飞书数据，即使在 `auto` 模式下凭证丢失，系统也**不会**用演示数据覆盖。另外，飞书拉取失败或返回 0 条记录时，本地缓存保持不变。

---

## 架构

```
浏览器 ──HTTPS──► Caddy ──► :3300  Fastify（单进程）
                               ├─ /api/*        业务 API（Cookie 鉴权）
                               ├─ /*            前端 SPA（dist/web）
                               ├─ SQLite        data/wangu.db（WAL，本地缓存，毫秒级查询）
                               ├─ 定时同步  ──► 飞书开放平台（多维表格，全量拉取 → 哈希比对增量入库）
                               └─ 能耗代理  ──► nenghao :3100（只读，带缓存，不可用时回退演示数据）
```

```
├── shared/contract.ts      前后端共享接口约定（唯一真相）
├── server/src/
│   ├── index.ts / app.ts   入口、Fastify 装配、静态托管、--sync-once
│   ├── config.ts  db.ts    配置、SQLite 建表与迁移
│   ├── buildings.ts        楼栋字典与归一化（"3#"/"三号楼"/"3号楼5层" → B03）
│   ├── feishu/             飞书客户端（token 缓存、分页、限流重试）与字段转换
│   ├── sync/               规范化 → 哈希 upsert / 删除 → sync_runs 记录、定时调度
│   ├── domain/             工单（超时、备注解析、统计）、遗留（分组、风险评分）
│   ├── energy/adapter.ts   ★ nenghao 响应解析（字段名候选集中在 FIELD_CANDIDATES）
│   ├── export/             Excel 索赔清单与工单明细导出
│   ├── mock/               演示数据生成（与真实数据走同一条入库链路）
│   └── routes/  auth.ts    接口路由、共享口令登录
├── web/src/                React 19 + Vite + Tailwind v4 + ECharts 前端
│   ├── components/buildings/layout.ts   ★ 园区平面布局坐标（贴合真实总平面时改这里）
│   └── styles/index.css    设计系统 tokens
├── docs/DESIGN_SYSTEM.md   设计系统规范
└── deploy/                 systemd、Caddy 示例
```

### 业务口径

- **楼栋编码**：`B01`~`B19` 加 `PUBLIC`（公区）。1~11 号楼为办公区，12~19 号楼为生活区。
- **看板列**：「待处理」「跟进中」「已完成」三列；「幕墙专项」归入「跟进中」列，并单独打标。
- **超时预警**（按报修时间计算）：
  - 待处理：超过 24 小时标黄，超过 72 小时标红。
  - 跟进中：超过 7 天标黄，超过 15 天标红。
- **专项摸排**：`报修渠道 = 专项摸排` 的工单。「排除专项摸排工单」开关用于计算物业日常纯运维绩效。
- **闭环率**：已完成 ÷ 总数。
- **遗留分组**（按「来源表」）：
  - 德才维修工单 → 德才
  - 上海建工维修工单 → 上海建工
  - 七局
  - 漏水清单 → 漏水专项
  - 有争议工单 → 争议待定责
- **风险评分**（0~100，规则表在 `server/src/domain/legacy.ts`）：
  - 计分依据：高空坠物和外立面玻璃、排污堵塞、用电安全、消防、渗漏等关键词，重复漏水、计划逾期、有争议等状态，以及挂账时长。
  - 70 分及以上为高危，进入「高危隐患雷达」。

---

## 部署时需核对

1. **nenghao 接口形状**：`/api/insight`、`/api/circuits`、`/api/solar` 已按真实样例对接；`overview`、`buildings`、`heatmap` 采用防御式解析。核对步骤：
   - 登录后访问 `/api/energy/_raw?path=/api/overview&start=2026-09-10%2000&end=2026-10-09%2023`，对照真实响应。
   - 如果字段名不同，只需修改 `server/src/energy/adapter.ts` 中的 `FIELD_CANDIDATES`。
   - 侧栏底部「数据源」显示「实时」即为对接成功。
   - 每个能耗接口的响应头 `X-Data-Mode` 会标明当次结果是 `live` 还是 `mock`。
2. **楼栋单日趋势**：通过逐日调用 nenghao `/api/buildings?start=…&end=…` 得到（并发 6，缓存 10 分钟）。如果 nenghao 有直接按楼栋查询趋势的接口，可以替换为直接调用。
3. **飞书 Base**：如果 `FHbvbq…` 是挂在知识库（wiki）下的多维表格，需要先换成真实的 app_token。
4. **园区平面图**：`web/src/components/buildings/layout.ts` 中的楼块坐标是示意布局，可以按实际总平面图调整。

---

## 本地开发

```bash
npm install
cp .env.example .env        # 不填飞书凭证即自动使用演示数据
npm run dev                  # 打开 http://localhost:5173
```

演示数据会生成 4,730 条日常工单和 156 条遗留（德才 21、上海建工 14、七局 2、漏水专项 61、争议待定责 58），数据由日期决定，可复现。nenghao 不可达时，能耗模块自动使用演示数据，侧栏会标注「演示数据」。
