# Procyon GUI 简化版 - 设计规范

## 项目概述
Procyon CM 随钻测量工具的简化版上位机软件，用于设备连接、参数设置、数据下载和系统测试。

## 设计风格

### 气质与意象
- **工业专业感**：参考 Unified Data Logger 原始软件，深蓝色侧边栏 + 浅灰色主内容区
- **可信赖感**：稳定的配色，清晰的层次，让用户在关键操作时感到安心
- **现代科技感**：虽然保留工业软件的严谨，但使用现代 Web 技术实现

### 配色方案
- **侧边栏背景**：深蓝 (#1a2744) - 左侧信息面板
- **强调色**：科技蓝 (#3b82f6) - 用于主要操作和卡片顶部边框
- **成功色**：翠绿 (#10b981) - 设备连接成功、测试通过、下载/上传卡片顶部
- **警告色**：琥珀 (#f59e0b) - 工作历史卡片顶部、固件版本警告
- **错误色**：红色 (#ef4444) - 错误状态、设备断开
- **背景色**：浅灰 (#f1f5f9) - 主内容区背景
- **卡片色**：纯白 (#ffffff) - 功能卡片
- **紫色**：(#8b5cf6) - 设备监控卡片顶部

### 功能卡片顶部颜色
- Device Initialization: 蓝色 (#3b82f6)
- Download / Upload: 绿色 (#10b981)
- Work History: 黄色 (#f59e0b)
- Config Status: 蓝色 (#3b82f6)
- Device Monitoring: 紫色 (#8b5cf6)
- Settings: 深灰 (#374151)

### 布局结构
- **左侧面板（固定宽度约320px）**：
  - 时间戳显示
  - LDAP Login Information（UserID, Access）
  - General Connection Status（Internet, Device，绿/灰圆点指示）
  - Connected Device（Device Name, Firmware Version, Tool S/N, Device State）
  - Battery Voltage（带电池图标和数值）
- **顶部栏**：汉堡菜单 + 软件标题 + 语言切换 + 主页按钮
- **右侧主内容区**：当前功能模块的操作界面

### 交互设计
- **状态指示**：绿色/灰色圆点表示连接状态
- **Device Initialization**：3步向导（Job Info > Tool Info > Device Info）+ Initialize Logger 按钮
- **Device Monitoring**：Real-Time / System 标签切换，测试项勾选列表，Single Start 按钮
- **Download/Upload**：File Download / File Upload 标签，Parse Data 勾选，Start Dumping 按钮

### 设计禁忌
- ❌ 不要使用过于花哨的动画效果
- ❌ 不要隐藏关键信息（设备状态、操作结果）
- ❌ 不要偏离原始软件的布局逻辑
