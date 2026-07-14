# UDL 升级路线图 (Unified Data Logger v8.0 → Procyon CM GUI)

## 概述

设备固件升级后，原始软件从 **Procyon v4.6.7** 升级为 **Unified Data Logger v8.0.17**。
现有软件使用旧的 VID/PID (0x2269/0xBEEF) 和 libusb0 驱动，无法连接新固件设备。

## 核心架构变更

### 1. USB 后端变更
| 项目 | 旧版 (Procyon v4) | 新版 (UDL v8) |
|------|-------------------|---------------|
| USB 库 | libusb0.dll (libusb-win32) | libusb-1.0.dll |
| .NET 封装 | LibUsbDotNet v2.2.8 (LibUsb 后端) | LibUsbDotNet v3.x (LibUsb 后端) |
| 驱动 | libusb0.sys v1.4.0.0 | libusb-1.0 驱动 |
| 接口 | Interface 1 (Interface 0 不存在) | 待确认 |
| 端点 | EP1 OUT=0x01, EP1 IN=0x81 | 待确认 |

### 2. VID/PID 变更
- **旧版**: VID=0x2269, PID=0xBEEF
- **新版**: ⚠️ 待确认（新 DLL 中未找到 0x2269，可能已变更）
  - 可能在 Database.dll 的设备配置表中
  - 可能从配置文件加载
  - 需要用户在设备管理器中确认实际 VID/PID

### 3. 命令协议变更
- **命令总数**: 旧版约 80+ → 新版 309 个 USBCOM_CMD_* 常量
- **命名空间**: `USBCOM_CMD_` 前缀统一
- **新增类别**:
  - 磁力计 (Magnetometer) - GET_MAGNETOMETER_MEASUREMENT_STATS
  - 应变测量 (StrainMeasurement) - GET_STRAIN_MEASUREMENT_STATS
  - 波形配置 (WaveformConfig) - RPM/Shock/Pressure/Magnetometer/Limpets
  - 传感器系数 (SensorCoefficients) - 压力/应变/Limpet 校准系数
  - 钻头参数扩展 - Bit Size/Height/Radius/Angles 等
  - 唤醒时间配置 - WakeUpTime StartUpDelay/ShutDownDuration
  - FastMemDump (快速内存转储) - START_FAST_MEMDUMP 等
  - Limpet Midpoint Offset 校准
  - 固件更新 (FirmwareUpdate)
  - 内部 Flash 擦除 (EraseInternalFlash)
  - 停机 RPM 阈值 (ShutdownRpmThreshold)

### 4. 新增 ECC (Reed-Solomon) 纠错
- 新 DLL 中发现 `ecc_rs_tt`、`CorrectPage`、`EncodePage`、`EncodeSpecialRecordPage`
- `get_ParityBytesPerPage`、`get_BlocksPerPage`、`get_DataBytesPerPage`
- 数据页传输带纠错码，需要解码

### 5. 设备类型架构
- **统一基类**: `DataLoggerDevice` (DataLoggerDeviceProtocol)
- **具体实现**:
  - `UsbTools.CM` - CM 型设备
  - `UsbTools.EM` - EM 型设备  
  - `UsbTools.Retina` - Retina 设备
  - `UsbTools.RetinaMini` - Retina Mini 设备
- **配置类**: CMSettings, EMSettings, RetinaSettings, RetinaMiniSettings

### 6. 数据操作层
- `DeviceDataOperations` 基类
  - `DataLoggerDumper` - 数据转储 (下载)
  - `DataLoggerEraser` - 内存擦除

### 7. 新功能模块
- **SCPI 协议支持**: ProcyonNet.SCPI.dll
- **VISA/GPIB 支持**: Ivi.Visa.dll, NationalInstruments.Visa.dll
- **Modbus 支持**: NModbus.dll
- **称重传感器**: ProcyonNet.LoadCell.dll
- **Azure/云集成**: Azure.Identity, Azure.Core, MSAL
- **加密数据库**: SQLCipher (e_sqlcipher.dll)
- **RetinaQC 工具**: Python 打包的质量控制工具

## 升级实施计划

### Phase 1: USB 通信层升级 (高优先级)
- [ ] 1.1 确认新 VID/PID（需用户提供设备管理器信息）
- [ ] 1.2 升级 koffi FFI 从 libusb0 到 libusb-1.0
- [ ] 1.3 设备枚举和连接逻辑重写
- [ ] 1.4 端点配置确认和 Bulk 传输适配

### Phase 2: 协议层升级
- [ ] 2.1 新命令枚举值提取（需进一步逆向或设备测试）
- [ ] 2.2 命令配置表架构 (CommandConfigPair)
- [ ] 2.3 ECC Reed-Solomon 编解码实现
- [ ] 2.4 FastDump 快速转储支持
- [ ] 2.5 EnterCommScope 通信握手机制

### Phase 3: 设备抽象层升级
- [ ] 3.1 DeviceContext 重构为多设备类型支持
- [ ] 3.2 设备类型自动检测 (CM/EM/Retina)
- [ ] 3.3 命令配置按设备类型分发
- [ ] 3.4 传感器可用性检测 (GetSensorAvailability)

### Phase 4: 数据解析层升级
- [ ] 4.1 新版 LogConverter.dll 逆向分析
- [ ] 4.2 新记录类型支持 (Magnetometer, Strain, etc.)
- [ ] 4.3 ECC 解码后的记录解析
- [ ] 4.4 FastDump 数据格式支持

### Phase 5: UI/功能层升级
- [ ] 5.1 设备类型选择界面
- [ ] 5.2 新增参数配置页 (钻头扩展、波形配置、传感器系数)
- [ ] 5.3 磁力计/应变测量监控页
- [ ] 5.4 FastDump 下载模式
- [ ] 5.5 固件更新功能
- [ ] 5.6 唤醒时间配置

### Phase 6: 兼容性与回归
- [ ] 6.1 旧固件设备兼容模式
- [ ] 6.2 数据下载格式兼容性验证
- [ ] 6.3 性能测试 (FastDump vs 普通转储)
- [ ] 6.4 多设备类型回归测试

## 已知/待确认事项

### ⚠️ 需要用户确认的信息

1. **新设备 VID/PID**:
   - 请在设备管理器中查看设备属性 → 详细信息 → 硬件 ID
   - 格式: `USB\VID_XXXX&PID_XXXX`
   - 或者在 UDL 软件连接后查看设备信息

2. **接口号和端点**:
   - 新固件使用哪个 Interface (0 还是 1)?
   - 端点地址是否仍为 0x01/0x81?

3. **命令码值**:
   - DLL 字符串中只有命令名，没有具体数值
   - 需要 IL 反编译或抓包获取具体 command code 值
   - 用户可提供:
     - ILSpy 反编译的 UsbCom.dll 源码
     - 或 USB 抓包文件 (Wireshark + USBPcap)

4. **记录格式变化**:
   - 新版本是否有新的记录类型?
   - RecordFormatFiles.json 是否有更新?

5. **设备类型**:
   - 用户当前使用的是 CM、EM、还是 Retina 设备?

### 可立即实施的改动

1. ✅ USB 后端从 libusb0 → libusb-1.0 (API 差异需要适配)
2. ✅ 命令枚举结构升级 (新增命令占位)
3. ✅ DeviceContext 架构调整 (多设备类型预留)
4. ✅ 新 DLL 和配置文件整理

## DLL 文件清单 (已上传到 assets/)

### 核心通信
- `UnifiedDataLogger.UsbCom.dll` (249KB) - USB 通信核心
- `ProcyonNet.SCPI.dll` (39KB) - SCPI 协议支持
- `LibUsbDotNet.dll` (54KB) - USB 库封装
- `libusb-1.0.dll` (173KB) - libusb 1.0 运行库

### 数据处理
- `LogConverter.dll` (372KB) - 日志转换
- `ProcyonNet.LogConverter.dll` (6KB) - LogConverter 封装
- `ProcyonNet.LoadCell.dll` (13KB) - 称重传感器
- `ProcyonNet.Common.Utilities.dll` (16KB) - 通用工具

### 数据存储
- `Database.dll` (990KB/1.5MB) - EF Core 数据库层
- `e_sqlcipher.dll` - SQLCipher 加密数据库

### 诊断工具
- `Core.UsbTrafficLogger.dll` (10KB) - USB 流量日志

## 技术风险评估

| 风险 | 等级 | 说明 |
|------|------|------|
| VID/PID 未知 | 高 | 无法连接设备的根本原因，需尽快确认 |
| 命令码值未知 | 高 | 309个命令但值未知，需逆向或抓包 |
| ECC 算法 | 中 | Reed-Solomon 实现需验证正确性 |
| FastDump 协议 | 中 | 全新的快速转储协议，需详细分析 |
| 多设备类型 | 低 | 架构上预留接口，逐步完善 |
| 记录格式变更 | 低 | 旧格式大概率兼容，新增类型可后续支持 |
