# Procyon CM GUI - 项目文档

## 项目概述

Procyon CM 随钻测量工具简化版上位机软件。支持设备连接、参数设置、数据下载和系统测试。
无机器码验证，中英文双语界面。

## 版本技术栈

- **Framework**: Next.js 16 (App Router) + Electron
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **Desktop**: Electron 37 + node-usb (USB bulk 通信)
- **Package Manager**: pnpm (仅限 pnpm)

## 目录结构

```
├── electron/                    # Electron 主进程
│   ├── main.js                  # Electron 入口，窗口创建 + IPC 注册
│   ├── preload.js               # Preload 脚本，暴露 electronAPI
│   └── usb-bridge.js            # USB 通信桥接（node-usb，VID=0x2269 PID=0xBEEF）
├── public/                      # 静态资源
├── scripts/                     # 构建与启动脚本
│   ├── build.sh                 # Next.js 构建
│   ├── dev.sh                   # Next.js 开发服务器
│   ├── electron-dev.sh          # Electron 开发模式（Next.js + Electron）
│   ├── electron-build.sh        # Electron 打包
│   ├── prepare.sh               # 预处理
│   ├── start.sh                 # 生产环境启动
│   └── validate.sh              # 验证
├── src/
│   ├── app/                     # 页面路由
│   │   ├── layout.tsx           # 根布局
│   │   ├── page.tsx             # 首页（Dashboard）
│   │   ├── connection/          # 设备连接页
│   │   ├── parameters/          # 参数设置页
│   │   ├── download/            # 数据下载页
│   │   ├── systemTest/          # 系统测试页
│   │   ├── settings/            # 系统设置页
│   │   └── about/               # 关于页
│   ├── components/
│   │   ├── layout/              # 布局组件 (AppLayout, Sidebar, Header)
│   │   └── ui/                  # shadcn/ui 组件库
│   ├── lib/
│   │   ├── device/context.tsx   # DeviceContext（设备状态管理）
│   │   ├── i18n/                # 国际化 (zh.ts, en.ts, context.tsx)
│   │   ├── usb/procyon.ts       # 渲染进程 USB 通信层（IPC 桥接）
│   │   └── utils.ts             # 工具函数
│   └── server.ts                # 自定义服务端入口
├── next.config.ts               # Next.js 配置
├── package.json                 # 依赖管理（含 electron-builder 配置）
└── tsconfig.json                # TypeScript 配置
```

## 关键架构

### 双模式运行
- **Web 模式**: `pnpm dev` 启动 Next.js 开发服务器（端口 5000），USB 功能不可用
- **Electron 模式**: `pnpm electron:dev` 启动 Next.js + Electron，USB 功能可用

### USB 通信链路
```
页面组件 → useDevice() (DeviceContext)
         → procyon.ts (IPC 调用)
         → window.electronAPI (preload.js 暴露)
         → ipcMain.handle (main.js)
         → usb-bridge.js (node-usb USB bulk 传输)
         → Procyon CM 硬件 (VID=0x2269, PID=0xBEEF)
```

### DeviceContext 接口
```typescript
interface DeviceContextType {
  connected: boolean;
  connecting: boolean;
  deviceInfo: DeviceInfo | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
  usbDevices: UsbDeviceInfo[];
  refreshDevices: () => Promise<void>;
  refreshDeviceInfo: () => Promise<void>;
  setToolSN / setRunID / setCustomer / setDistrict / setCountry / setDepthOut;
  downloadedData: OneSecondRecord[];
  downloadData: (onProgress?) => Promise<void>;
  clearData: () => void;
  exportData: () => string;
  testResults: SelfTestResult[];
  runSelfTest: () => Promise<void>;
}
```

## 构建与运行命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动 Web 开发服务器 |
| `pnpm build` | 构建 Next.js |
| `pnpm start` | 启动生产模式 |
| `pnpm ts-check` | TypeScript 类型检查 |
| `pnpm lint` | ESLint 检查 |
| `pnpm electron:dev` | 启动 Electron 开发模式 |
| `pnpm electron:build` | 打包 Windows .exe 安装程序 |

## USB 设备信息

- **VID**: 0x2269
- **PID**: 0xBEEF
- **驱动**: libusb-win32 (libusb0.sys v1.4.0.0)，设备 GUID `{0BDA4BB5-9CFD-4571-9190-E01A1948AEBF}`
- **传输方式**: USB Bulk Transfer（EP1 OUT=0x01, EP1 IN=0x81, 64 bytes max packet）
- **设备类**: CDC ACM (0x0A)，但使用 Bulk 传输而非虚拟串口
- **接口**: 只有 Interface 1（Interface 0 不存在，ClaimInterface(0) 会失败）
- **原始软件**: Procyon.exe 使用 LibUsbDotNet.dll (v2.2.8.0/v3.0.0.0 LibUsb 后端)
- **DLL 逆向**: ILSpy 成功反编译 Procyon.dll → decompiled.cs (4.2MB)，已提取完整协议
- **沙箱注意**: Web 模式下 USB 不可用；Electron 模式需在本地 Windows 运行
- **沙箱构建**: `ELECTRON_SKIP_BINARY_DOWNLOAD=1` 必须设置，否则 pnpm install 会因 Electron 下载超时而失败

## USB 通信协议（从 Procyon.dll 逆向确认）

### 通用包格式
```
[cmdlow, cmdhigh, lengthlow, lengthhigh, ...data]
```
- cmdlow = commandCode & 0xFF, cmdhigh = (commandCode >> 8) & 0xFF
- lengthlow = data.length & 0xFF, lengthhigh = (data.length >> 8) & 0xFF
- GET 命令: data 为空, length = 0 → 4 字节包
- SET 命令: data = ASCII 编码的字符串值, length = data.length → 4+data.length 字节包
- **发送精确字节数**，不用 0xFF 填充到 64 字节
- **响应码**：设备响应的 command code = 请求码 + 1

### GET 命令（已验证成功）
| 命令 | 枚举值 | Hex |
|------|--------|-----|
| GET_FIRMWARE_VERSION | 5 | 0x0005 |
| GET_BATTERY_VOLTAGE | 64 | 0x0040 |
| GET_DEVICE_TIME | 66 | 0x0042 |
| GET_TEMPERATURE_DATA_CM | 70 | 0x0046 |
| GET_CUSTOMER | 258 | 0x0102 |
| GET_COUNTRY | 262 | 0x0106 |
| GET_DISTRICT | 266 | 0x010A |
| GET_RUN_ID_TYPE | 270 | 0x010E |
| GET_RUN_ID | 274 | 0x0112 |
| GET_DEPT_OUT | 278 | 0x0116 |
| GET_UNIQUE_ID | 282 | 0x011A |
| GET_LDAP | 286 | 0x011E |
| GET_TOOL_TYPE | 304 | 0x0130 |
| GET_TOOL_SIZE | 312 | 0x0138 |
| GET_TOOL_POSITION | 316 | 0x013C |
| GET_CONFIG_NAME | 328 | 0x0148 |
| GET_TOOL_SN | 332 | 0x014C |

### SET 命令（从 DLL 确认，待设备验证）
| 命令 | 枚举值 | Hex | 数据格式 |
|------|--------|-----|----------|
| SET_DEVICE_TIME | 68 | 0x0044 | 4字节 unix timestamp |
| SET_PARAMETERS_INTO_FLASH | 256 | 0x0100 | 无数据（确认写 Flash） |
| SET_CUSTOMER | 260 | 0x0104 | ASCII 字符串 |
| SET_COUNTRY | 264 | 0x0108 | ASCII 字符串 |
| SET_DISTRICT | 268 | 0x010C | ASCII 字符串 |
| SET_RUN_ID_TYPE | 272 | 0x0110 | ASCII 字符串 |
| SET_RUN_ID | 276 | 0x0114 | ASCII 字符串 |
| SET_DEPT_OUT | 280 | 0x0118 | ASCII 字符串 |
| SET_UNIQUE_ID | 284 | 0x011C | ASCII 字符串 |
| SET_LDAP | 288 | 0x0120 | ASCII 字符串 |
| SET_TOOL_TYPE | 306 | 0x0132 | ASCII 字符串 |
| SET_TOOL_SIZE | 314 | 0x013A | ASCII 字符串 |
| SET_TOOL_POSITION | 318 | 0x013E | ASCII 字符串 |
| SET_CONFIG_NAME | 330 | 0x014A | ASCII 字符串 |
| SET_TOOL_SN | 334 | 0x014E | ASCII 字符串 |
| SET_UH_CONNECTION_TYPE | 354 | 0x0162 | ASCII 字符串 |
| SET_DH_CONNECTION_TYPE | 358 | 0x0166 | ASCII 字符串 |
| SET_INT_PRESSURE_SENSOR_SN | 362 | 0x016A | ASCII 字符串 |
| SET_EXT_PRESSURE_SENSOR_SN | 366 | 0x016E | ASCII 字符串 |
| SET_LIMPET_SENSOR_SN | 370 | 0x0172 | ASCII 字符串 |

### SET 协议关键规则（从 DLL 确认）
1. **ASCII 编码**: `ASCIIconversion()` 将字符串每个字符直接转 byte（无 null 终止符）
2. **length 字段**: = data 字节数（即字符串长度），不是固定值
3. **精确字节数**: `WriteToDeviceAsync` 直接写 `4+data.length` 字节，不填充 0xFF
4. **50ms 延迟**: EMSetInitParameters 在每个 SET 命令间 `await Task.Delay(50)`
5. **Flash 写入**: 所有 SET 完成后，发送 `SET_PARAMETERS_INTO_FLASH (0x0100)` 持久化
6. **WriteIntoFlash**: 调用 `AckResponseAsync(SET_PARAMETERS_INTO_FLASH)` → 发4字节包，等 ACK
7. **读超时**: 预知长度 200ms，未知长度 75ms
8. **写超时**: 1000ms
9. **Read endpoint**: `OpenEndpointReader(ReadEndpointID 129)` = EP1 IN (0x81)
10. **Write endpoint**: `OpenEndpointWriter(WriteEndpointID 1)` = EP1 OUT (0x01)

### SET 响应判断
- SET 命令返回字符串值，`"0"` 表示失败，非零非null 表示成功
- 响应包格式: `[cmdlow_resp, cmdhigh_resp, lengthlow, lengthhigh, ...data]` (响应码 = 请求码 + 1)

## 编码规范

- TypeScript strict 模式，禁止隐式 any
- React 19+ 不需要 `import React from 'react'`
- 所有组件使用 `'use client'` 指令
- 禁止在 JSX 中直接使用 `typeof window`、`Date.now()` 等（需 useEffect + useState）
- 使用 shadcn/ui 组件和规范
