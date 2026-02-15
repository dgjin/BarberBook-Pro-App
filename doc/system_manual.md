# BarberBook Pro 系统说明书

**版本**: 1.0.1  
**日期**: 2023-10-24

---

## 1. 系统概述

**BarberBook Pro** 是一款面向高端理发店的综合管理系统，集成了顾客预约、AI 发型顾问、排队监控以及后台管理功能。系统采用现代化的前端技术栈，并结合 Supabase 数据库提供实时数据支持，利用 Google Gemini API 提供智能对话服务。

### 核心价值
- **顾客体验升级**: 通过 AI 咨询和实时排队监控，减少等待焦虑，提升互动性。
- **管理效率提升**: 数字化排班、预约管理和自动审计日志，降低人工成本。
- **数据驱动**: 实时看板展示店铺运营状态，辅助决策。

---

## 2. 技术架构

### 前端
- **框架**: React 18 (TypeScript)
- **样式**: Tailwind CSS (Utility-first CSS)
- **图标**: Google Material Symbols
- **AI 集成**: @google/genai (Gemini 2.5 Flash)

### 后端 (BaaS)
- **数据库**: Supabase (PostgreSQL)
- **API**: Supabase JS SDK
- **身份验证**: (当前版本使用模拟用户，可扩展 Supabase Auth)

### 部署环境
- 支持静态托管 (Vercel, Netlify) 或 Docker 容器化部署。
- 依赖环境变量配置 API Key。

---

## 3. 功能模块详解

### 3.1 顾客端 (Customer App)

| 模块 | 功能描述 | 关键交互 |
| :--- | :--- | :--- |
| **首页 (Home)** | 展示店铺状态、实时排队人数、推荐理发师及近期活动。 | 动态获取理发师列表 (Supabase `app_barbers` 表)。 |
| **预约 (Booking)** | 选择理发师、日期及时间段，并进行支付确认。 | 提交预约后写入数据库 `app_appointments` 表，并记录日志。 |
| **AI 顾问 (AI Chat)** | 基于 Gemini 模型的智能对话，提供发型建议及图片参考。 | 使用 `generateHairConsultation` 服务调用 Google GenAI API。 |
| **签到 (Check-in)** | 展示预约凭证二维码，支持保存到相册或 Apple Wallet。 | 模拟保存与添加到钱包的交互动画。 |
| **监控 (Monitor)** | 公共大屏模式，展示当前叫号进度及理发师工作状态。 | 实时刷新排队数据，适合店内电视展示。 |

### 3.2 管理端 (Admin Portal)

| 模块 | 功能描述 | 关键交互 |
| :--- | :--- | :--- |
| **看板 (Dashboard)** | 周视图展示预约饱和度，日视图展示详细时段占用。 | 可视化图表，AI 分析建议。 |
| **工作台 (Workbench)** | 理发师个人工作界面，扫码核销预约，管理当前服务。 | 模拟二维码扫描，状态流转 (服务中 -> 完成)。 |
| **管理 (Management)** | 理发师档案管理 (CRUD)，状态切换，排班设置。 | 数据库 `app_barbers` 表的增删改查。 |
| **日志 (Logs)** | 审计日志查看，支持搜索和导出 CSV。 | 从 `app_logs` 表拉取操作记录，支持按类型筛选。 |
| **设置 (Settings)** | 系统参数配置，营业时间、自动备份及数据库维护。 | 提供数据库连接状态检测及手动同步功能。 |

---

## 4. 数据库设计

系统采用关系型数据库 PostgreSQL (via Supabase)。

### 4.1 理发师表 (`app_barbers`)
存储员工基本信息及状态。

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `id` | BIGINT | 主键，自增 |
| `name` | TEXT | 姓名 |
| `title` | TEXT | 头衔 (如: 高级总监) |
| `status` | TEXT | 状态: active, busy, rest |
| `specialties`| TEXT[] | 擅长技能标签数组 |
| `rating` | FLOAT | 评分 (0.0 - 5.0) |
| `image` | TEXT | 头像 URL |

### 4.2 预约表 (`app_appointments`)
存储顾客预约记录。

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `id` | BIGINT | 主键，自增 |
| `customer_name`| TEXT | 顾客姓名 |
| `barber_name` | TEXT | 理发师姓名 |
| `service_name` | TEXT | 服务项目名称 |
| `date_str` | TEXT | 日期字符串 (如: 10月24日) |
| `time_str` | TEXT | 时间字符串 (如: 14:30) |
| `status` | TEXT | 状态: pending, confirmed, completed |

### 4.3 日志表 (`app_logs`)
存储系统操作审计记录。

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `id` | BIGINT | 主键，自增 |
| `user` | TEXT | 操作人 |
| `role` | TEXT | 角色 |
| `action` | TEXT | 动作简述 |
| `details` | TEXT | 详细描述 |
| `type` | TEXT | 日志级别: info, warning, danger |

---

## 5. 配置与使用

### 5.1 环境变量配置
在项目根目录创建或配置环境变量：

```bash
# Supabase 配置 (数据库支持)
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"

# Google Gemini API (AI 支持)
API_KEY="your-gemini-api-key"
```

> **注意**: 如果未配置 `SUPABASE_URL`，系统将自动降级为 **Mock 模式**，使用内存中的模拟数据运行，此时数据刷新后会丢失。

### 5.2 数据库初始化
1. 登录 Supabase 后台。
2. 进入 SQL Editor。
3. 复制并运行 `doc/db_schema.sql` 中的内容。

### 5.3 运行项目
```bash
npm install
npm start
```

---

## 6. 常见问题 (FAQ)

**Q: 为什么“理发师管理”中看不到数据？**  
A: 请检查 `SUPABASE_URL` 是否配置正确。如果未配置，系统应显示默认的模拟数据。检查浏览器控制台是否有网络请求错误。

**Q: AI 顾问不回复消息？**  
A: AI 功能依赖 `API_KEY`。请确保 Google GenAI API Key 有效且额度充足。如果未配置 Key，AI 会返回固定的默认回复。

**Q: 如何导出日志？**  
A: 在“审计日志”页面右上角点击下载图标，系统会模拟导出 CSV 文件的过程。
