
# BarberBook Pro 系统详细设计说明书 (SDS)

**版本**: 1.4.2  
**状态**: 正式发布  

---

## 1. 系统概述
BarberBook Pro 是一款基于 AI 驱动的高级理发店综合管理系统，旨在解决理发店预约难、排队乱、业绩核算不透明等痛点。系统采用云底座架构，提供全链路的数字化管理方案。

---

## 2. 核心架构设计

### 2.1 技术栈
- **前端**: React 19 + Tailwind CSS + Material Symbols
- **后端/数据库**: Supabase (PostgreSQL)
- **AI 引擎**: Google Gemini API (2.5 Flash / 3 Flash)
- **状态同步**: Supabase Realtime (WebSockets)

### 2.2 角色模型
- **顾客 (Customer)**: 预约、排队监控、AI 咨询、理发券消费。
- **理发师 (Barber)**: 工作台处理、扫码签到、业绩查看。
- **管理员 (Admin)**: 全面人员管理、财务看板、系统配置、日志审计。

---

## 3. 核心功能模块设计

### 3.1 预约与排队引擎 (Booking & Queue Engine)
- **并发控制**: 预约时进行原子化预校验，防止同一时段双重订购。
- **动态排位**: 结合理发师实时状态与服务时长，动态计算预计等待时间。

### 3.2 理发券财务系统 (Voucher Financial System)
- **余额管理**: 存储于 `app_customers.vouchers`。
- **核销逻辑**: 服务完成时（Workbench 操作），若 `vouchers > 0`，则自动执行 `-1` 扣减并标记 `used_voucher = true`。
- **自动对账**: 
    - **累加**: 理发师生涯收入 `app_barbers.voucher_revenue` 随订单完成自动累加。
    - **冲正**: 订单取消时，若已用券，则回退客户券余额并从理发师业绩中扣除。

### 3.3 年度看板统计 (Annual Dashboard, v1.4.2)
- **统计逻辑**: 实时聚合 `app_appointments` 表中满足自然年范围（1月1日起）的已完成用券记录。
- **可视化**: 采用钱包图标入口，大屏展示核销总量与个人贡献占比。

---

## 4. 数据库建模 (Data Model)

### 4.1 主要表结构
- **`app_barbers`**: 理发师档案、生涯总收益、排班计划。
- **`app_customers`**: 顾客资料、哈希加密密码、理发券余额。
- **`app_appointments`**: 核心预约记录、服务状态机、用券标识。
- **`app_logs`**: 全系统操作审计日志。

---

## 5. 安全与隐私
- **密码存储**: 使用 SHA-256 客户端预哈希 + 数据库存储。
- **RLS 策略**: Supabase Row Level Security 确保用户仅能访问其权限范围内的数据。
