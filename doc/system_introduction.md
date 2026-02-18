
# BarberBook Pro 系统深度解析手册

**版本**: 1.5.6
**作者**: 首席架构师
**更新日期**: 2024-03-28

---

## 1. 系统设计思路 (Design Philosophy)

BarberBook Pro 的设计目标是构建一个**高美感、高效率、绝对真实**的现代化理发店生态系统。

### 1.1 视觉与交互 (UI/UX)
*   **iOS 风格一致性**: 采用 Apple 的设计语言，大量使用 `ios-blur` (毛玻璃)、`rounded-3xl` (大圆角) 和 `SF Pro/Noto Sans` 字体组合，营造高端沙龙的精致感。
*   **响应式布局**: 针对移动端（顾客/理发师）和大屏端（店内电视/iPad 监控）进行了专门的适配优化。

### 1.2 财务真实性 (Financial Integrity)
*   **动态后端聚合 (Dynamic Backend Aggregation)**: 系统抛弃了“属性累加”模式，改为“原始数据聚合”模式。理发师的营收和成就不是存储在某个字段里的数字，而是每次加载时从 `app_appointments` 原始单据中实时 `SUM` 计算出来的。这种方式确保了数据无法被篡改，且具备天然的可审计性。

---

## 2. 核心模块详解

### 2.1 顾客移动端 (Client Portal)
*   **AI 发型咨询**: 基于 Google Gemini 3 Flash 模型。
*   **实时候补逻辑**: 订阅 `app_appointments` 变更。当理发师在工作台签到某位顾客时，其他排队顾客的位次将自动上移。

### 2.2 理发师工作台 (Workbench 2.0)
*   **模块功能**:
    *   **对账看板**: 包含今日战报与生涯荣誉。
    *   **降级签到**: 支持 QR 扫描与 ID 手动输入双模签到。
*   **实现方式**:
    *   **云端实时对账**: 通过 Supabase Realtime 订阅，工作台在监听到 `status` 变更为 `completed` 后会自动重算所有看板指标。

### 2.3 监控大屏中心 (Web Monitor)
*   **语音叫号 (TTS)**: 采用**科大讯飞 (iFLYTEK)** 语音引擎，支持 16kHz PCM 高保真播报。
*   **状态同步**: 结合 WebSocket 和 10s 轮询双机制，确保监控屏与后台数据高度同步。

### 2.4 管理员看板与设置 (Admin Dashboard)
*   **数据可视化**: 全年度/全店维度的理发券核销统计排行。
*   **原子化冲正**: 取消已结算订单时，系统自动执行“订单撤回+资产退回+业绩冲正”的原子化链式操作。

---

## 3. 技术实现原理 (Technical Implementation)

### 3.1 指标聚合算法
```sql
-- 逻辑示意：实时计算理发师 Marcus 今日营收
SELECT SUM(price) FROM app_appointments 
WHERE barber_name = 'Marcus K.' 
AND status = 'completed' 
AND date_str = '3月28日';
```
在前端 `Workbench.tsx` 中，这种逻辑通过 Supabase 查询过滤器实现，配合 `setLoading` 状态展示，确保用户感知的准确性。

### 3.2 语音播报触发链
1.  理发师端：点击签到 -> 修改 `status` 为 `checked_in`。
2.  Supabase：更新记录并向所有订阅频道推送消息。
3.  Monitor端：捕获消息 -> 生成叫号文本 -> 调用讯飞 WebSocket 合成音频 -> Web Audio API 播放。

---

## 4. 总结与展望
BarberBook Pro 实现了从“手工记账”到“实时对账”的飞跃。v1.5.6 版本的发布标志着系统已经具备了应对中大型沙龙真实业务流水的能力。
