
# BarberBook Pro 系统详细设计说明书 (SDS)

**版本**: 1.5.5  
**状态**: 正式发布  
**更新日期**: 2024-03-27

---

## 1. 系统概述
BarberBook Pro 是一款基于 AI 驱动的高级理发店综合管理系统。本说明书详细阐述系统的核心业务逻辑、数据流转及关键技术实现方案。

---

## 2. 理发券财务系统 (Voucher Financial System)

### 2.1 收入统计逻辑 (Dynamic Aggregation)
系统放弃了传统的静态业绩累计方案，转而采用**实时动态聚合逻辑**，以确保财务数据的绝对真实与一致性。
- **核心逻辑**: 通过查询 `app_appointments` 表中满足条件的记录总数计算得出。

### 2.2 预约取消、退券及业绩冲正机制
系统建立了严密的财务冲正闭环，自动处理异常订单对资产的影响。

---

## 3. 预约单号追踪系统 (Appointment ID Tracking)

### 3.1 唯一标识符定义
- **单号格式**: 系统生成的 `BIGINT` 自增 ID。
- **业务作用**: 用于前台核销、理发师核对及审计对账。

---

## 4. 资源排班系统 (Scheduling System)

### 4.1 周排班日历细节
排班模块基于“周循环”模型设计，存储于 `app_barbers.schedule` 数组。

---

## 5. 实时监控与叫号 (Live Monitor)

### 5.1 状态转换与播报触发
监控大屏通过 WebSocket 监听 `UPDATE` 事件。当捕捉到 `checked_in` 状态切换时触发。

### 5.2 语音播报技术栈 (TTS Engine)
- **核心引擎**: **科大讯飞 (iFLYTEK) 语音合成 Web API**。
- **实现原理**: 
  - 前端通过 HMAC-SHA256 算法生成 WebSocket 鉴权 URL。
  - 通过 WebSocket 发送 JSON 格式的待合成文本。
  - 接收讯飞返回的 Base64 编码 PCM (16bit, 16kHz) 音频流。
  - 使用浏览器 **Web Audio API** 进行无缝解码与播放。
- **降级方案**: 若讯飞服务不可用，系统将自动回退至浏览器原生 `speechSynthesis` (Web Speech API)。
