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
- **驱动**: 需通过 Zadig 安装 WinUSB 驱动
- **传输方式**: USB Bulk Transfer（非 CDC 串口）

## 编码规范

- TypeScript strict 模式，禁止隐式 any
- React 19+ 不需要 `import React from 'react'`
- 所有组件使用 `'use client'` 指令
- 禁止在 JSX 中直接使用 `typeof window`、`Date.now()` 等（需 useEffect + useState）
- 使用 shadcn/ui 组件和规范
