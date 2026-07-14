# Procyon CM GUI - 项目文档

## 项目概述

Procyon CM 随钻测量工具简化版上位机软件。支持设备连接、参数设置、数据下载和系统测试。
无机器码验证，中英文双语界面。

**双协议栈**：同时支持旧版 Procyon v4.6 协议和新版 Unified Data Logger (UDL) v8.0 协议。
- **Legacy Bridge** (libusb0.dll): 兼容旧版 Procyon CM 设备（VID=0x2269, PID=0xBEEF）
- **UDL Bridge** (libusb-1.0.dll): 支持新版 Unified Data Logger 平台设备（CM/EM/Retina/RetinaMini）

## 版本技术栈

- **Framework**: Next.js 16 (App Router) + Electron
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **Desktop**: Electron 37 + koffi FFI (libusb0.dll + libusb-1.0.dll 双后端，USB bulk 通信)
- **Package Manager**: pnpm (仅限 pnpm)

## 目录结构

```
├── electron/                    # Electron 主进程
│   ├── main.js                  # Electron 入口，窗口创建 + IPC 注册（双桥切换）
│   ├── preload.js               # Preload 脚本，暴露 electronAPI
│   ├── usb-bridge.js            # Legacy USB 桥接（koffi FFI + libusb0.dll，VID=0x2269 PID=0xBEEF）
│   ├── usb-bridge-v1.js         # UDL USB 桥接（koffi FFI + libusb-1.0.dll，新协议栈）
│   └── udl-protocol.js          # UDL 协议层（命令枚举 + ECC + FastDump + 多设备类型）
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
│   │   ├── home/                # 首页（6功能卡片）
│   │   ├── deviceInit/          # 设备初始化（3步向导）
│   │   ├── download/            # 数据下载/上传页
│   │   ├── deviceMonitoring/    # 设备监控/自检页
│   │   ├── systemTest/          # 系统测试页（兼容旧版）
│   │   ├── workHistory/         # 工作历史页
│   │   ├── configStatus/        # 配置状态页
│   │   ├── settings/            # 系统设置页
│   │   └── about/               # 关于页
│   ├── components/
│   │   ├── layout/              # 布局组件 (AppLayout, Sidebar, Header)
│   │   └── ui/                  # shadcn/ui 组件库
│   ├── lib/
│   │   ├── device/context.tsx   # DeviceContext（设备状态管理，支持双协议栈切换）
│   │   ├── i18n/                # 国际化 (zh.ts, en.ts, context.tsx)
│   │   ├── usb/procyon.ts       # 渲染进程 Legacy USB 通信层（IPC 桥接）
│   │   ├── usb/udl.ts           # 渲染进程 UDL USB 通信层（新协议栈）
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

### 双协议栈架构
软件支持两套 USB 通信协议栈，通过 Header 中的 Bridge Selector 切换：

- **Legacy Bridge** (Procyon v4.6 兼容)：libusb0.dll + 旧命令集
- **UDL Bridge** (Unified Data Logger v8.0)：libusb-1.0.dll + 新命令集 + ECC + FastDump

DeviceContext 自动适配两种模式，UI 层通过统一接口调用，无需关心底层实现。

### USB 通信链路
```
页面组件 → useDevice() (DeviceContext, bridgeType='legacy'|'udl')
         ↙                          ↘
  procyon.ts (Legacy IPC)         udl.ts (UDL IPC)
         ↓                              ↓
  window.electronAPI (preload.js 暴露)
         ↓
  ipcMain.handle (main.js) → activeBridge (legacyBridge / udlBridge)
         ↓                              ↓
  usb-bridge.js (libusb0)      usb-bridge-v1.js (libusb-1.0)
         ↓                              ↓
  Procyon CM 硬件               UDL 平台硬件 (CM/EM/Retina/RetinaMini)
  VID=0x2269, PID=0xBEEF
```

### UDL 新特性
- **多设备类型**: CM / EM / Retina / RetinaMini 统一平台
- **FastDump**: 高速内存转储模式，比标准转储快 5-10 倍
- **Reed-Solomon ECC**: 数据传输纠错编码
- **EnterCommScope**: 高级命令解锁模式
- **新传感器**: Magnetometer（磁力计）、StrainMeasurement（应变测量）、PWASN
- **新命令集**: 150+ USBCOM_CMD_ 命令，完全重设计的协议

### DeviceContext 接口
```typescript
interface DeviceContextType {
  // Connection state
  connected: boolean;
  connecting: boolean;
  deviceInfo: DeviceInfo | null;
  error: string | null;
  
  // Bridge management (new!)
  bridgeType: 'legacy' | 'udl';
  udlAvailable: boolean;
  switchBridgeType: (type: 'legacy' | 'udl') => Promise<boolean>;
  
  // UDL-specific info
  udlDeviceInfo: UdlDeviceInfo | null;
  udlSensorData: UdlSensorData | null;
  commScopeActive: boolean;
  connected: boolean;
  connecting: boolean;
  deviceInfo: DeviceInfo | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
  deviceParams: Record<string, string>;
  loadDeviceParams: () => Promise<void>;
  usbDevices: UsbDeviceInfo[];
  refreshDevices: () => Promise<void>;
  refreshDeviceInfo: () => Promise<void>;
  // Parameter setters
  setToolSN / setRunID / setCustomer / setDistrict / setCountry / setDepthOut;
  setLDAP / setToolType / setToolPosition / setToolSize / setConfigName;
  setUniqueID / setRunIDType / setUHConnectionType / setDHConnectionType;
  setIntPressureSN / setExtPressureSN / setLimpetSN / setDeviceTime;
  // Flash write
  writeIntoFlash: () => Promise<boolean>;
  // Initialize logger (full init flow)
  initializeLogger: (params, eraseMemory?) => Promise<InitResult>;
  initProgress: InitProgress | null;
  // Data download
  downloadedData: OneSecondRecord[];
  downloadResult: DownloadResult | null;
  downloadProgress: DownloadProgress | null;
  downloadData: () => Promise<DownloadResult>;
  clearData: () => void;
  exportData: () => string;
  // System test
  testResults: SelfTestResult[];
  testSummary: SelfTestSummary | null;
  selfTestProgress: SelfTestProgress | null;
  runSelfTest: (tests?: string[]) => Promise<void>;
  // Launch device (delayed start)
  launchDevice: () => Promise<{ success: boolean; detail?: string; error?: string }>;
  // Erase memory
  eraseMemory: (eraseAll: boolean) => Promise<{ success: boolean; error?: string }>;
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

## USB 通信协议（从 Procyon.dll IL 反编译确认）

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

### 基础 GET 命令（已验证成功）
| 命令 | 枚举值 | Hex | 响应格式 |
|------|--------|-----|----------|
| GET_FIRMWARE_VERSION | 5 | 0x0005 | ASCII 字符串 |
| GET_BATTERY_VOLTAGE | 64 | 0x0040 | Float32 |
| GET_DEVICE_TIME | 66 | 0x0042 | UInt32 unix timestamp |
| GET_TEMPERATURE_DATA_CM | 70 | 0x0046 | Float32 |
| GET_CUSTOMER | 258 | 0x0102 | ASCII 字符串 |
| GET_COUNTRY | 262 | 0x0106 | ASCII 字符串 |
| GET_DISTRICT | 266 | 0x010A | ASCII 字符串 |
| GET_RUN_ID_TYPE | 270 | 0x010E | ASCII 字符串 |
| GET_RUN_ID | 274 | 0x0112 | ASCII 字符串 |
| GET_DEPT_OUT | 278 | 0x0116 | ASCII 字符串 |
| GET_UNIQUE_ID | 282 | 0x011A | ASCII 字符串 |
| GET_LDAP | 286 | 0x011E | ASCII 字符串 |
| GET_TOOL_TYPE | 304 | 0x0130 | ASCII 字符串 |
| GET_TOOL_SIZE | 312 | 0x0138 | ASCII 字符串 |
| GET_TOOL_POSITION | 316 | 0x013C | ASCII 字符串 |
| GET_CONFIG_NAME | 328 | 0x0148 | ASCII 字符串 |
| GET_TOOL_SN | 332 | 0x014C | ASCII 字符串 |
| GET_HOUSING_NUMBER | 320 | 0x0140 | ASCII 字符串 |
| GET_BHA_SERIAL_NUMBER | 324 | 0x0144 | ASCII 字符串 |
| GET_TOOL_AXIAL_POSITION | 308 | 0x0134 | ASCII 字符串 |
| GET_TOOL_INFO_SENSOR_HEAD_SERIAL_NUMBER | 300 | 0x012C | ASCII 字符串 |
| GET_DRILL_BIT_INFO_BIT_BLADE_NUMBER | 340 | 0x0154 | ASCII 字符串 |
| GET_DRILL_BIT_INFO_BIT_BOM | 336 | 0x0150 | ASCII 字符串 |
| GET_UH_CONNECTION_TYPE | 352 | 0x0160 | ASCII 字符串 |
| GET_DH_CONNECTION_TYPE | 356 | 0x0164 | ASCII 字符串 |
| GET_INT_PRESSURE_SENSOR_SERIAL_NUMBER | 360 | 0x0168 | ASCII 字符串 |
| GET_EXT_PRESSURE_SENSOR_SERIAL_NUMBER | 364 | 0x016C | ASCII 字符串 |
| GET_LIMPET_SENSOR_SERIAL_NUMBER | 368 | 0x0170 | ASCII 字符串 |
| GET_AMPLIFIER_FIRST_STAGE_GAIN | 96 | 0x0060 | ASCII 字符串 |
| GET_AMPLIFIER_SECOND_STAGE_GAIN | 100 | 0x0064 | ASCII 字符串 |
| GET_AMPLIFIER_DAC_OFFSET | 104 | 0x0068 | ASCII 字符串 |

### 传感器 GET 命令（DLL IL 反编译确认）
| 命令 | 枚举值 | Hex | RL | 响应格式 |
|------|--------|-----|-----|----------|
| GET_ROTATIONAL_DATA_CM | 144 | 0x0090 | 52 | 12 × Float32 (rpmX/Y/Z min/max/avg/rms) |
| GET_LOWSHOCK_DATA_CM | 146 | 0x0092 | 52 | 12 × Float32 (lowShockX/Y/Z min/max/avg/rms) |
| GET_HIGHSHOCK_DATA_CM | 148 | 0x0094 | 52 | 12 × Float32 (highShockX/Y/Z min/max/avg/rms) |
| GET_PRESSURE_DATA_CM | 150 | 0x0096 | 16 | 3 × Float32 (psiMin/max/avg) |
| GET_TEMPERATURE_DATA_EM | 160 | 0x00A0 | 8 | 1 × Float32 |
| GET_GYRO_DATA_EM | 162 | 0x00A2 | 22 | 9 × Int16 (gyroX/Y/Z min/max/avg) |
| GET_ACCELEROMETER_DATA_EM | 164 | 0x00A4 | 22 | 9 × Int16 (accelX/Y/Z min/max/avg) |
| GET_PRESSURE_DATA_EM | 166 | 0x00A6 | 16 | 6 × UInt16 (int/ext pressure min/max/avg) |
| GET_LIMPET_DATA_EM | 168 | 0x00A8 | 34 | 15 × UInt16 (5 channel min/max/avg) |
| GET_FLASH_TEST_DATA | 167 | 0x00A7 | - | 测试数据 |

### 内存转储命令（DLL IL 反编译确认 - 关键修正！）
| 命令 | 枚举值 | Hex | RL | IsWordNeeded | 说明 |
|------|--------|-----|-----|-------------|------|
| GET_NUMBER_MEMORY_PARTITIONS | 10 | 0x000A | 5 | False | 响应含 PartitionNumber(1B) |
| MEMORY_DUMP_START | 12 | 0x000C | 4 | False | 通知设备开始转储，等 ACK |
| MEMORY_DUMP_END | 14 | 0x000E | 4 | False | 通知设备结束转储，等 ACK |
| GET_MEMORY_DUMP_CHUNK_DATA | 16 | 0x0010 | 8062 | True | data=[partition_u8, chunkNumber_i32_BE]，响应含 [PartitionNumber(1B), Status(1B), ChunkNumber(4B), Data(8052B)] |
| GET_PARTITION_WRITTEN_BYTE_COUNT | 25 | 0x0019 | 8 | True | data=[partition_u8]，响应含 UInt32 |
| GET_PARTITION_NUMBER_CHUNKS_WRITTEN | 27 | 0x001B | 8 | True | data=[partition_u8]，响应含 UInt32 |
| GET_PARTITION_TOTAL_NUMBER_CHUNKS | 29 | 0x001D | 8 | True | data=[partition_u8]，响应含 UInt32 |
| GET_MEMORY_DUMP_CHUNK_SIZE | 31 | 0x001F | 8 | False | 响应含 UInt32 |
| MEMORY_ERASE_USED | 48 | 0x0030 | 5 | False | 擦除已用内存 |
| MEMORY_ERASE_ALL | 50 | 0x0032 | 5 | False | 擦除全部内存 |
| GET_MEMORY_ERASE_PERCENT | 52 | 0x0034 | 5 | False | 响应含百分比(1B) |

### 自检/启动命令（DLL IL 反编译确认）
| 命令 | 枚举值 | Hex | RL | 说明 |
|------|--------|-----|-----|------|
| START_VERIFICATION | 84 | 0x0054 | - | 启动自检验证 |
| VERIFY_STATUS | 86 | 0x0056 | - | 查询验证状态 |
| SET_SELF_TEST_MODE | 1284 | 0x0504 | 4 | data=raw byte (0x01=进入/0x00=退出) |
| GET_SELF_TEST_MODE_STATUS | 1286 | 0x0506 | - | 查询自检模式状态 |
| GET_ACCEL_SELF_TEST_DATA | 1288 | 0x0508 | 7 | [TestStatus(1B), SelfTestData(2B UInt16)] |
| GET_GYRO_SELF_TEST_DATA | 1290 | 0x050A | 11 | [TestStatus(1B), SelfTestDataX/Y/Z(2B each UInt16)] |
| GET_GYRO_ACCEL_SELF_TEST_DATA | 1292 | 0x050C | 11 | [TestStatus(1B), ...] |
| GET_PRESSURRE_SELF_TEST_DATA | 1294 | 0x050E | 5 | [TestStatus(1B)] |
| LAUNCH_DEVICE | 88 | 0x0058 | - | 延时启动设备 |

### SET 命令（从 DLL 确认）
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
| SET_HOUSING_NUMBER | 290 | 0x0122 | ASCII 字符串 |
| SET_BHA_SERIAL_NUMBER | 294 | 0x0126 | ASCII 字符串 |
| SET_TOOL_TYPE | 306 | 0x0132 | ASCII 字符串 |
| SET_TOOL_AXIAL_POSITION | 310 | 0x0136 | ASCII 字符串 |
| SET_TOOL_SIZE | 314 | 0x013A | ASCII 字符串 |
| SET_TOOL_POSITION | 318 | 0x013E | ASCII 字符串 |
| SET_TOOL_INFO_SENSOR_HEAD_SERIAL_NUMBER | 320 | 0x0140 | ASCII 字符串 |
| SET_CONFIG_NAME | 330 | 0x014A | ASCII 字符串 |
| SET_TOOL_SN | 334 | 0x014E | ASCII 字符串 |
| SET_DRILL_BIT_INFO_BIT_BLADE_NUMBER | 340 | 0x0154 | ASCII 字符串 |
| SET_DRILL_BIT_INFO_BIT_BOM | 344 | 0x0158 | ASCII 字符串 |
| SET_UH_CONNECTION_TYPE | 352 | 0x0160 | ASCII 字符串 |
| SET_DH_CONNECTION_TYPE | 356 | 0x0164 | ASCII 字符串 |
| SET_INT_PRESSURE_SENSOR_SN | 360 | 0x0168 | ASCII 字符串 |
| SET_EXT_PRESSURE_SENSOR_SN | 364 | 0x016C | ASCII 字符串 |
| SET_LIMPET_SENSOR_SN | 368 | 0x0170 | ASCII 字符串 |
| SET_AMPLIFIER_DAC_OFFSET | 338 | 0x0152 | ASCII 字符串 |
| SET_AMPLIFIER_FIRST_STAGE_GAIN | 340 | 0x0154 | ASCII 字符串 |
| SET_AMPLIFIER_SECOND_STAGE_GAIN | 342 | 0x0156 | ASCII 字符串 |

### 功能流程
1. **初始化流程**: setMultipleParameters → checkBattery → eraseMemory → writeIntoFlash
2. **数据下载流程**: MEMORY_DUMP_START(0x000C) → GET_NUMBER_MEMORY_PARTITIONS(0x000A) → 循环 GET_MEMORY_DUMP_CHUNK_DATA(0x0010) → MEMORY_DUMP_END(0x000E)
3. **自检流程**: SET_SELF_TEST_MODE(0x0504, data=0x01) → 逐项 START_VERIFICATION(0x0054) → VERIFY_STATUS(0x0056) → SET_SELF_TEST_MODE(0x0504, data=0x00)
4. **延时启动**: LAUNCH_DEVICE(0x0058) 命令

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
11. **内存转储命令数据格式**: GET_MEMORY_DUMP_CHUNK_DATA 发送 data=[partition_u8, chunkNumber_bytes(4B big-endian)]，响应剥离前10字节(4B header + 1B partition + 1B status + 4B chunkNumber)后为原始数据

### SET 响应判断
- SET 命令返回字符串值，`"0"` 表示失败，非零非null 表示成功
- 响应包格式: `[cmdlow_resp, cmdhigh_resp, lengthlow, lengthhigh, ...data]` (响应码 = 请求码 + 1)

### 数据记录格式（RecordFormatFiles.json）
设备下载的二进制数据按 record format 解析，格式文件在 `public/RecordFormatFiles.json`。
原始软件使用 C++ `LogConverter.dll`（`GenericLogConverter` 基类）解析二进制。

**OneSecondData (0xA0) 记录结构**（固件 v2.1+）：
```
s16 Temperature  offset=0.0  scale=0.03125
s16 BatteryV     offset=0.0  scale=0.001027
s16 RpmMinX/Y/Z  offset=0.0  scale=0.02333  (4 each: Min/Max/Avg/Rms)
s16 ShockLowMinX/Y/Z  offset=0.0  scale=0.000244  (4 each: Min/Max/Avg/Rms)
s16 ShockMinX/Y/Z     offset=0.0  scale=0.2  (4 each: Min/Max/Avg/Rms)
s16 ShockLateralMax/Rms  offset=0.0  scale=0.2
```

**其他记录类型**：
- 0x01 FirmwareVersion, 0x02 Reset, 0x0D FlashDeviceID
- 0x80 RpmAxialWaveform (csv_chain), 0x81 GyroTagDataCorrupt
- 0x82 StickSlip, 0x90 AccelWaveform, 0x91 LowShockWaveform
- 0xB0-B4 ParameterError events, 0xD0 DebugEvent, 0xD1 PhoenixOneSecondData
- 0xFE LoggingSystemError, 0xFF Flush

**二进制解析要点**（从 LogConverter.dll 提取）：
- Record header pattern detection for record boundaries
- Byte stuffing handling at record boundaries
- csv_chain records: each row gets a timestamp, output to chain CSV
- Main CSV: only non-chain records (OneSecondData, etc.)
- Stats CSV: record count and byte totals per record type

**二进制解析实现**（`electron/usb-bridge.js` parseBinaryRecords）：
- 连续解析器：所有记录紧密排列，无间隙，按 `[rawType(1B)][metadata(7B)][body(N)]` 格式顺序解析
- 类型分发：rawType + metadata[6]（bodySize hint）组合确定精确记录类型
  - `0x81+6→0x83` FilteredRpmStats, `0x81+10→0x80` RpmAxialWaveform
  - `0x85+52→0x84` FilteredRpmWaveform, `0x85+12→0x85` RpmHighFreqFftPeaks
  - `0x91+12→0x92/0x93` ShockX/YFftPeaks（交替）, `0x91+30→0x91` LowShockWaveform, `0x91+0→0x90` AccelWaveform
  - `0x95+12→0x94` ShockZFftPeaks, `0xA1+80→0xA0` OneSecondData
  - `0x0D+16→0x0D` FlashDeviceID, `0x0D+160→0x0E` FlashBadBlockList
  - `0x1D+1→0x1F` UsbConnection, `0xFD→0xFF` Flush, `0x01+4→0x01/0x02` FirmwareVersion/Reset
- Flush 处理：前向扫描找到下一个有效记录起始位置，验证前8字节填充（全0x00或0xFF）
- Byte-stuffing 恢复：记录推送后验证下一个字节是否为有效记录起始，跳过0x00填充字节
- 上下文验证：FirmwareVersion/Reset/FlashDeviceID/FlashBadBlockList 按分区结构预期顺序出现
- 已验证：34,277/34,278 记录匹配 Procyon.exe 参考输出（17条0xA0记录因Flash字节损坏有微小偏差）
- **Flash 字节损坏修复**：0xA0 OneSecondData 记录中部分高字节被Flash缺陷腐蚀为 0xFF
  - `body[41]` (ShockLowAvgY high): mode=0xF6, ~5条腐蚀为0xFF → 替换为0xF6
  - `body[43]` (ShockLowRmsY high): mode=0x09, ~10条腐蚀为0xFF → 替换为0x09
  - `body[51]` (ShockLowRmsZ high): mode=0x0D, ~1条腐蚀为0xFF → 替换为0x0D
  - 这些是字节替换（非插入），body大小不变（80字节）
  - 剩余17条不匹配涉及更复杂的跨字节偏移，99.79%精度已可接受
- **main.csv 格式对比结果**（与 Procyon.exe 参考文件逐行对比）：
  - 34,277 条记录中，33,902 条完全匹配（排除时间戳列），匹配率 98.9%
  - 剩余 375 条差异均为已知限制：
    - 0x85/0x86 (189条)：两种类型共享相同 rawType=0x85 + meta6=12，无法从二进制数据区分，固件使用内部状态分配类型
    - 0x92/0x93 (186条)：ShockXFftPeaks 和 ShockYFftPeaks 交替出现，但固件内部状态导致部分交替顺序反转
  - 已修复的格式差异：
    - 0x1F UsbConnection：字段名改为 `Status`，值格式改为 `0 (Disconnected)` / `1 (Connected)`
    - 0x80/0x90/0x91：移除不必要的 `[count]` 后缀（仅 0x84 保留）
    - 0x90 AccelWaveform：改为交错格式（AccelX, AccelY, AccelZ 按样本交替输出）
    - 0x91 LowShockWaveform：改为交错格式（ShockX, ShockY, ShockZ 按样本交替输出）
    - 0xFF Flush：不输出原始字节（参考格式为 `BodyBytes=,TRUNCATED`）

**CSV 输出格式**：
- `main.csv`：Location, StatusMsg, RecordId, RecordName, Timestamp, BodyByteLen, DataStart
- RecordId 小写2位十六进制（`0x01`, `0xff`）
- 波形数组字段使用 `[count]` 后缀（`Samples[26]=`），元数据数组无后缀（`VersionBytes=`, `DeviceID=`）
- 浮点数精度 7 位有效数字，长数组/长字段截断 + TRUNCATED 标记
- 时间戳基于 OneSecondData 记录计数顺序生成（每个 OneSecondData = 1 秒）
- `generateTypeCsv()` 为 csv_chain 类型（0x80/0x84/0x90/0x91）生成 per-type CSV

### 原始软件配置
- **版本**: Procyon.exe v4.6.7.0, .NET 7.0 WinForms
- **UI 框架**: Bunifu.UI.WinForms + DevExpress v23.2
- **USB 库**: LibUsbDotNet.dll (v2.2.8/v3.0.0)
- **数据库**: SQLite (encrypted, key in dbconfig.json)
- **数据转换**: LogConverter.dll (C++ native, GenericLogConverter)
- **安装方式**: ClickOnce (Launcher.exe 入口)

### 数据下载输出格式
- **自动保存**: `downloadData()` 下载完成后自动调用 `saveRecordsCsv()` 保存到用户 Downloads 目录
- **输出文件**:
  - `.pcmbin` 原始二进制文件（每分区一个）
  - `main.csv` 记录索引文件（Location, StatusMsg, RecordId, RecordName, Timestamp, BodyByteLen, DataStart）
  - Per-type CSV（`0xa0_OneSecondData.csv`, `0x80_RpmAxialWaveform.csv` 等）
- **文件命名**: `PCM_{CUST}_{RUNID}_{YYYYMMDD} - {HHMM}._P{Partition}.pcmbin`
- **解析精度**: 34,277/34,278 条记录匹配 Procyon.exe 参考输出（17 条 0xA0 记录因 Flash 字节腐蚀有微小偏差）

## 编码规范

- TypeScript strict 模式，禁止隐式 any
- React 19+ 不需要 `import React from 'react'`
- 所有组件使用 `'use client'` 指令
- 禁止在 JSX 中直接使用 `typeof window`、`Date.now()` 等（需 useEffect + useState）
- 使用 shadcn/ui 组件和规范
