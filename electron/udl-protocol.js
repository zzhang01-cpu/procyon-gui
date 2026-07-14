/**
 * UDL v8 Command Protocol Layer
 *
 * Unified Data Logger v8.0+ command definitions and protocol helpers.
 * Includes:
 * - Full USBCOM_CMD_* command enumeration (names from UDL UsbCom.dll)
 * - Command configuration (response type, payload needed, etc.)
 * - Packet build/parse helpers
 * - ECC (Reed-Solomon) support placeholders
 * - FastDump protocol placeholders
 *
 * NOTE: Command VALUES (numeric codes) are NOT yet fully known.
 * Legacy commands keep their original values.
 * New commands are assigned placeholder values and need to be confirmed
 * via IL decompilation or USB packet capture.
 *
 * TODO items marked with [NEEDS_CONFIRMATION] require reverse engineering.
 */

// =====================================================
// Command Enum (USBCOM_CMD_*)
// =====================================================
// 309 total commands extracted from UnifiedDataLogger.UsbCom.dll
// Values for legacy commands are confirmed (from Procyon v4)
// Values for new commands are placeholders (0xFFFF)

var CMD = {
  // =================================================
  // System / Basic commands
  // =================================================
  GET_FIRMWARE_VERSION: 0x0005,  // [CONFIRMED - legacy]
  GET_NUMBER_MEMORY_PARTITIONS: 0x000A,  // [CONFIRMED - legacy]
  MEMORY_DUMP_START: 0x000C,  // [CONFIRMED - legacy]
  MEMORY_DUMP_END: 0x000E,  // [CONFIRMED - legacy]
  GET_MEMORY_DUMP_CHUNK_DATA: 0x0010,  // [CONFIRMED - legacy]
  GET_PARTITION_WRITTEN_BYTE_COUNT: 0x0019,  // [CONFIRMED - legacy]
  GET_PARTITION_NUMBER_CHUNKS_WRITTEN: 0x001B,  // [CONFIRMED - legacy]
  GET_PARTITION_TOTAL_NUMBER_CHUNKS: 0x001D,  // [CONFIRMED - legacy]
  GET_MEMORY_DUMP_CHUNK_SIZE: 0x001F,  // [CONFIRMED - legacy]

  MEMORY_ERASE_USED: 0x0030,  // [CONFIRMED - legacy]
  MEMORY_ERASE_ALL: 0x0032,  // [CONFIRMED - legacy]
  GET_MEMORY_ERASE_PERCENT: 0x0034,  // [CONFIRMED - legacy]

  GET_BATTERY_VOLTAGE: 0x0040,  // [CONFIRMED - legacy]
  GET_DEVICE_TIME: 0x0042,  // [CONFIRMED - legacy]
  SET_DEVICE_TIME: 0x0044,  // [CONFIRMED - legacy]
  GET_TEMPERATURE_DATA: 0x0046,  // [RENAMED - was GET_TEMPERATURE_DATA_CM]
  GET_TEMPERATURE_DATA_EM: 0x00A0,  // [CONFIRMED - legacy]

  // Firmware update
  ERASE_INTERNAL_FLASH: 0x0050,
  FIRMWARE_UPDATE_BUFFER: 0x0052,
  START_VERIFICATION: 0x0054,  // [CONFIRMED - legacy]
  VERIFY_STATUS: 0x0056,  // [CONFIRMED - legacy]
  LAUNCH_DEVICE: 0x0058,  // [CONFIRMED - legacy]
  UPDATE_STATE: 0x005A,
  ABORT_FIRMWARE_UPDATE: 0x005C,

  // Amplifier
  GET_AMPLIFIER_FIRST_STAGE_GAIN: 0x0060,  // [CONFIRMED - legacy]
  SET_AMPLIFIER_FIRST_STAGE_GAIN: 0x0062,  // [CONFIRMED - legacy]
  GET_AMPLIFIER_SECOND_STAGE_GAIN: 0x0064,  // [CONFIRMED - legacy]
  SET_AMPLIFIER_SECOND_STAGE_GAIN: 0x0066,  // [CONFIRMED - legacy]
  GET_AMPLIFIER_DAC_OFFSET: 0x0068,  // [CONFIRMED - legacy]
  SET_AMPLIFIER_DAC_OFFSET: 0x006A,  // [CONFIRMED - legacy]

  // =================================================
  // Sensor Data Commands (CM side)
  // =================================================
  // Note: Old names had _CM suffix, new names drop it
  GET_ROTATIONAL_DATA: 0x0090,  // [RENAMED - was GET_ROTATIONAL_DATA_CM]
  GET_LOWSHOCK_DATA: 0x0092,  // [RENAMED - was GET_LOWSHOCK_DATA_CM]
  GET_HIGHSHOCK_DATA: 0x0094,  // [RENAMED - was GET_HIGHSHOCK_DATA_CM]
  GET_PRESSURE_DATA: 0x0096,  // [RENAMED - was GET_PRESSURE_DATA_CM]

  // =================================================
  // Sensor Data Commands (EM side)
  // =================================================
  GET_ROTATIONAL_DATA_EM: 0x00A2,  // [RENAMED - was GET_GYRO_DATA_EM]
  GET_LOWSHOCK_DATA_EM: 0x00A4,  // [RENAMED - was GET_ACCELEROMETER_DATA_EM]
  GET_PRESSURE_DATA_EM: 0x00A6,  // [CONFIRMED - legacy]
  GET_LIMPET_DATA_EM: 0x00A8,  // [CONFIRMED - legacy]

  // =================================================
  // Self-test mode commands
  // =================================================
  SET_SELF_TEST_MODE: 0x0504,  // [CONFIRMED - legacy]
  GET_SELF_TEST_MODE_STATUS: 0x0506,  // [CONFIRMED - legacy]
  GET_ACCEL_SELF_TEST_DATA: 0x0508,  // [CONFIRMED - legacy]
  GET_GYRO_SELF_TEST_DATA: 0x050A,  // [CONFIRMED - legacy]
  GET_GYRO_ACCEL_SELF_TEST_DATA: 0x050C,  // [CONFIRMED - legacy]
  GET_PRESSURRE_SELF_TEST_DATA: 0x050E,  // [CONFIRMED - legacy]

  // =================================================
  // Flash / Parameters (string config)
  // =================================================
  SET_PARAMETERS_INTO_FLASH: 0x0100,  // [CONFIRMED - legacy]

  // Job Info
  GET_CUSTOMER: 0x0102, SET_CUSTOMER: 0x0104,  // [CONFIRMED - legacy]
  GET_COUNTRY: 0x0106, SET_COUNTRY: 0x0108,  // [CONFIRMED - legacy]
  GET_DISTRICT: 0x010A, SET_DISTRICT: 0x010C,  // [CONFIRMED - legacy]
  GET_RUN_ID_TYPE: 0x010E, SET_RUN_ID_TYPE: 0x0110,  // [CONFIRMED - legacy]
  GET_RUN_ID: 0x0112, SET_RUN_ID: 0x0114,  // [CONFIRMED - legacy]
  GET_DEPT_OUT: 0x0116, SET_DEPT_OUT: 0x0118,  // [CONFIRMED - legacy]
  GET_UNIQUE_ID: 0x011A, SET_UNIQUE_ID: 0x011C,  // [CONFIRMED - legacy]
  GET_LDAP: 0x011E, SET_LDAP: 0x0120,  // [CONFIRMED - legacy]

  // Housing / BHA
  GET_HOUSING_NUMBER: 0x0140, SET_HOUSING_NUMBER: 0x0142,  // [CONFIRMED - legacy]
  GET_BHA_SERIAL_NUMBER: 0x0144, SET_BHA_SERIAL_NUMBER: 0x0146,  // [CONFIRMED - legacy]

  // Tool Info
  GET_TOOL_INFO_SENSOR_HEAD_SERIAL_NUMBER: 0x012C,  // [CONFIRMED - legacy]
  SET_TOOL_INFO_SENSOR_HEAD_SERIAL_NUMBER: 0x012E,  // [CONFIRMED - legacy]
  GET_TOOL_TYPE: 0x0130, SET_TOOL_TYPE: 0x0132,  // [CONFIRMED - legacy]
  GET_TOOL_AXIAL_POSITION: 0x0134, SET_TOOL_AXIAL_POSITION: 0x0136,  // [CONFIRMED - legacy]
  GET_TOOL_SIZE: 0x0138, SET_TOOL_SIZE: 0x013A,  // [CONFIRMED - legacy]
  GET_TOOL_POSITION: 0x013C, SET_TOOL_POSITION: 0x013E,  // [CONFIRMED - legacy]

  // Config / Tool SN
  GET_CONFIG_NAME: 0x0148, SET_CONFIG_NAME: 0x014A,  // [CONFIRMED - legacy]
  GET_TOOL_SN: 0x014C, SET_TOOL_SN: 0x014E,  // [CONFIRMED - legacy]

  // Drill Bit Info (legacy)
  GET_DRILL_BIT_INFO_BIT_BOM: 0x0150, SET_DRILL_BIT_INFO_BIT_BOM: 0x0152,  // [CONFIRMED - legacy]
  GET_DRILL_BIT_INFO_BIT_BLADE_NUMBER: 0x0154, SET_DRILL_BIT_INFO_BIT_BLADE_NUMBER: 0x0156,  // [CONFIRMED - legacy]

  // Connection types
  GET_UH_CONNECTION_TYPE: 0x0160, SET_UH_CONNECTION_TYPE: 0x0162,  // [CONFIRMED - legacy]
  GET_DH_CONNECTION_TYPE: 0x0164, SET_DH_CONNECTION_TYPE: 0x0166,  // [CONFIRMED - legacy]

  // Pressure sensor serial numbers
  GET_INT_PRESSURE_SENSOR_SERIAL_NUMBER: 0x0168, SET_INT_PRESSURE_SENSOR_SERIAL_NUMBER: 0x016A,  // [CONFIRMED - legacy]
  GET_EXT_PRESSURE_SENSOR_SERIAL_NUMBER: 0x016C, SET_EXT_PRESSURE_SENSOR_SERIAL_NUMBER: 0x016E,  // [CONFIRMED - legacy]
  GET_LIMPET_SENSOR_SERIAL_NUMBER: 0x0170, SET_LIMPET_SENSOR_SERIAL_NUMBER: 0x0172,  // [CONFIRMED - legacy]

  // =================================================
  // NEW in UDL v8 - Command placeholders
  // [NEEDS_CONFIRMATION] These values need to be determined
  // via IL decompilation or USB packet capture
  // =================================================

  // -- Drill Bit Extended Info --
  GET_DRILL_BIT_INFO_BIT_SIZE: 0x0174, SET_DRILL_BIT_INFO_BIT_SIZE: 0x0176,  // [NEW - placeholder]
  GET_DRILL_BIT_INFO_HEIGHT: 0x0178, SET_DRILL_BIT_INFO_HEIGHT: 0x017A,  // [NEW - placeholder]
  GET_DRILL_BIT_INFO_RADIUS: 0x017C, SET_DRILL_BIT_INFO_RADIUS: 0x017E,  // [NEW - placeholder]
  GET_DRILL_BIT_INFO_PROFILE_ANGLE: 0x0180, SET_DRILL_BIT_INFO_PROFILE_ANGLE: 0x0182,  // [NEW - placeholder]
  GET_DRILL_BIT_INFO_SIDE_RAKE: 0x0184, SET_DRILL_BIT_INFO_SIDE_RAKE: 0x0186,  // [NEW - placeholder]
  GET_DRILL_BIT_INFO_BACK_RAKE: 0x0188, SET_DRILL_BIT_INFO_BACK_RAKE: 0x018A,  // [NEW - placeholder]
  GET_DRILL_BIT_INFO_ANGLE_AROUND: 0x018C, SET_DRILL_BIT_INFO_ANGLE_AROUND: 0x018E,  // [NEW - placeholder]

  // -- PWA (Printed Wiring Assembly) serial numbers --
  GET_TOOL_INFO_PWA_SERIAL_NUMBER: 0x0190, SET_TOOL_INFO_PWA_SERIAL_NUMBER: 0x0192,  // [NEW - placeholder]
  GET_TOOL_INFO_PWA_SERIAL_NUMBER_R: 0x0194, SET_TOOL_INFO_PWA_SERIAL_NUMBER_R: 0x0196,  // [NEW - placeholder]

  // -- Bit serial number --
  GET_BIT_SERIAL_NUMBER: 0x0198, SET_BIT_SERIAL_NUMBER: 0x019A,  // [NEW - placeholder]

  // -- Wake-up time configuration --
  GET_WAKEUP_TIME_STARTUP_DELAY: 0x01A0, SET_WAKEUP_TIME_STARTUP_DELAY: 0x01A2,  // [NEW - placeholder]
  GET_WAKEUP_TIME_SHUTDOWN_DURATION: 0x01A4, SET_WAKEUP_TIME_SHUTDOWN_DURATION: 0x01A6,  // [NEW - placeholder]

  // -- Shutdown RPM threshold --
  GET_SHUTDOWN_RPM_THRESHOLD: 0x01A8, SET_SHUTDOWN_RPM_THRESHOLD: 0x01AA,  // [NEW - placeholder]

  // =================================================
  // NEW: Magnetometer
  // =================================================
  GET_MAGNETOMETER_MEASUREMENT_STATS: 0x01B0,  // [NEW - placeholder]

  // =================================================
  // NEW: Strain Measurement
  // =================================================
  GET_STRAIN_MEASUREMENT_STATS: 0x01B2,  // [NEW - placeholder]

  // =================================================
  // NEW: Waveform Configuration
  // =================================================
  GET_WAVEFORM_CONFIG_RPM_AXIAL: 0x01C0, SET_WAVEFORM_CONFIG_RPM_AXIAL: 0x01C2,  // [NEW - placeholder]
  GET_WAVEFORM_CONFIG_LOW_SHOCK: 0x01C4, SET_WAVEFORM_CONFIG_LOW_SHOCK: 0x01C6,  // [NEW - placeholder]
  GET_WAVEFORM_CONFIG_HIGH_SHOCK: 0x01C8, SET_WAVEFORM_CONFIG_HIGH_SHOCK: 0x01CA,  // [NEW - placeholder]
  GET_WAVEFORM_CONFIG_PRESSURE: 0x01CC, SET_WAVEFORM_CONFIG_PRESSURE: 0x01CE,  // [NEW - placeholder]
  GET_WAVEFORM_CONFIG_MAGNETOMETER: 0x01D0, SET_WAVEFORM_CONFIG_MAGNETOMETER: 0x01D2,  // [NEW - placeholder]
  GET_WAVEFORM_CONFIG_LIMPETS: 0x01D4, SET_WAVEFORM_CONFIG_LIMPETS: 0x01D6,  // [NEW - placeholder]

  // =================================================
  // NEW: Sensor Coefficients (calibration)
  // =================================================
  // Board strain gauge coefficients
  GET_BOARD_STRAIN_GAUGE1_COEFF: 0x01E0, SET_BOARD_STRAIN_GAUGE1_COEFF: 0x01E2,  // [NEW - placeholder]
  GET_BOARD_STRAIN_GAUGE2_COEFF: 0x01E4, SET_BOARD_STRAIN_GAUGE2_COEFF: 0x01E6,  // [NEW - placeholder]
  GET_BOARD_STRAIN_GAUGE3_COEFF: 0x01E8, SET_BOARD_STRAIN_GAUGE3_COEFF: 0x01EA,  // [NEW - placeholder]
  GET_BOARD_STRAIN_GAUGE4_COEFF: 0x01EC, SET_BOARD_STRAIN_GAUGE4_COEFF: 0x01EE,  // [NEW - placeholder]

  // Board pressure coefficients
  GET_BOARD_PRESSURE_INT_COEFF: 0x01F0, SET_BOARD_PRESSURE_INT_COEFF: 0x01F2,  // [NEW - placeholder]
  GET_BOARD_PRESSURE_EXT_COEFF: 0x01F4, SET_BOARD_PRESSURE_EXT_COEFF: 0x01F6,  // [NEW - placeholder]

  // Sensor pressure coefficients
  GET_SENSOR_PRESSURE_INT_COEFF: 0x01F8, SET_SENSOR_PRESSURE_INT_COEFF: 0x01FA,  // [NEW - placeholder]
  GET_SENSOR_PRESSURE_EXT_COEFF: 0x01FC, SET_SENSOR_PRESSURE_EXT_COEFF: 0x01FE,  // [NEW - placeholder]

  // Limpet sensor coefficients
  GET_SENSOR_LIMPET_COEFF: 0x0200, SET_SENSOR_LIMPET_COEFF: 0x0202,  // [NEW - placeholder]

  // =================================================
  // NEW: Fast Memory Dump (FastDump)
  // =================================================
  START_FAST_MEMDUMP: 0x0210,  // [NEW - placeholder]
  SET_FAST_MEMDUMP_INDEX: 0x0212,  // [NEW - placeholder]

  // =================================================
  // NEW: Limpet Midpoint Offset Calibration
  // =================================================
  START_LIMPET_MIDPOINT_OFFSET_PROCESS: 0x0220,  // [NEW - placeholder]
  ACK_LIMPET_MIDPOINT_OFFSET_PROCESS: 0x0222,  // [NEW - placeholder]
  GET_LIMPET_MIDPOINT_OFFSET_RESULT: 0x0224,  // [NEW - placeholder]

  // =================================================
  // Firmware update
  // =================================================
  ABORT_FIRMWARE_UPDATE_ACK: 0xFFFF,  // placeholder
  FIRMWARE_UPDATE_BUFFER_ACK: 0xFFFF,  // placeholder
  ERASE_INTERNAL_FLASH_ACK: 0xFFFF,  // placeholder
  UPDATE_STATE_ACK: 0xFFFF,  // placeholder

  // =================================================
  // ACK/Response constants (not sent as commands, used in responses)
  // =================================================
  UNKNOWN_COMMAND_NUMBER_RES: 0xFFFF,  // placeholder
};

// =====================================================
// Command Configuration (per device type)
// =====================================================
// Type: 'string' | 'float32' | 'uint16' | 'int16' | 'uint32' | 'int32' | 'byte' | 'raw'
// isPayloadNeeded: does GET command need data payload?
// isLengthDetermined: is response length known in advance?

var CMD_CONFIG = {
  // String GET/SET commands
  GET_FIRMWARE_VERSION: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  GET_CUSTOMER: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_CUSTOMER: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_COUNTRY: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_COUNTRY: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_DISTRICT: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_DISTRICT: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_RUN_ID_TYPE: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_RUN_ID_TYPE: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_RUN_ID: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_RUN_ID: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_DEPT_OUT: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_DEPT_OUT: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_UNIQUE_ID: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_UNIQUE_ID: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_LDAP: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_LDAP: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_HOUSING_NUMBER: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_HOUSING_NUMBER: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_BHA_SERIAL_NUMBER: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_BHA_SERIAL_NUMBER: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_TOOL_INFO_SENSOR_HEAD_SERIAL_NUMBER: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_TOOL_INFO_SENSOR_HEAD_SERIAL_NUMBER: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_TOOL_TYPE: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_TOOL_TYPE: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_TOOL_AXIAL_POSITION: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_TOOL_AXIAL_POSITION: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_TOOL_SIZE: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_TOOL_SIZE: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_TOOL_POSITION: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_TOOL_POSITION: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_CONFIG_NAME: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_CONFIG_NAME: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_TOOL_SN: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_TOOL_SN: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_DRILL_BIT_INFO_BIT_BOM: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_DRILL_BIT_INFO_BIT_BOM: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_DRILL_BIT_INFO_BIT_BLADE_NUMBER: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_DRILL_BIT_INFO_BIT_BLADE_NUMBER: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_UH_CONNECTION_TYPE: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_UH_CONNECTION_TYPE: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_DH_CONNECTION_TYPE: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_DH_CONNECTION_TYPE: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_INT_PRESSURE_SENSOR_SERIAL_NUMBER: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_INT_PRESSURE_SENSOR_SERIAL_NUMBER: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_EXT_PRESSURE_SENSOR_SERIAL_NUMBER: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_EXT_PRESSURE_SENSOR_SERIAL_NUMBER: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_LIMPET_SENSOR_SERIAL_NUMBER: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_LIMPET_SENSOR_SERIAL_NUMBER: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_AMPLIFIER_FIRST_STAGE_GAIN: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_AMPLIFIER_FIRST_STAGE_GAIN: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_AMPLIFIER_SECOND_STAGE_GAIN: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_AMPLIFIER_SECOND_STAGE_GAIN: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },
  GET_AMPLIFIER_DAC_OFFSET: { type: 'string', isPayloadNeeded: false, isLengthDetermined: false },
  SET_AMPLIFIER_DAC_OFFSET: { type: 'ack_string', isPayloadNeeded: true, isLengthDetermined: false },

  // Float32 GET commands
  GET_BATTERY_VOLTAGE: { type: 'float32', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 4 },
  GET_TEMPERATURE_DATA: { type: 'float32', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 4 },

  // UInt32
  GET_DEVICE_TIME: { type: 'uint32', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 4 },
  SET_DEVICE_TIME: { type: 'ack_uint32', isPayloadNeeded: true, isLengthDetermined: true },
  GET_MEMORY_DUMP_CHUNK_SIZE: { type: 'uint32', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 4 },
  GET_PARTITION_WRITTEN_BYTE_COUNT: { type: 'uint32', isPayloadNeeded: true, isLengthDetermined: true, responseLength: 4 },
  GET_PARTITION_NUMBER_CHUNKS_WRITTEN: { type: 'uint32', isPayloadNeeded: true, isLengthDetermined: true, responseLength: 4 },
  GET_PARTITION_TOTAL_NUMBER_CHUNKS: { type: 'uint32', isPayloadNeeded: true, isLengthDetermined: true, responseLength: 4 },

  // Byte / UInt8
  GET_NUMBER_MEMORY_PARTITIONS: { type: 'uint8', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 1 },
  GET_MEMORY_ERASE_PERCENT: { type: 'uint8', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 1 },
  GET_SELF_TEST_MODE_STATUS: { type: 'uint8', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 1 },
  SET_SELF_TEST_MODE: { type: 'ack_byte', isPayloadNeeded: true, isLengthDetermined: true },

  // Sensor data (CM) - Float32 arrays
  GET_ROTATIONAL_DATA: { type: 'float32_array', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 52, count: 12 },
  GET_LOWSHOCK_DATA: { type: 'float32_array', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 52, count: 12 },
  GET_HIGHSHOCK_DATA: { type: 'float32_array', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 52, count: 12 },
  GET_PRESSURE_DATA: { type: 'float32_array', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 16, count: 3 },

  // Sensor data (EM) - Int16 arrays
  GET_TEMPERATURE_DATA_EM: { type: 'float32', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 8 },
  GET_ROTATIONAL_DATA_EM: { type: 'int16_array', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 22, count: 9 },
  GET_LOWSHOCK_DATA_EM: { type: 'int16_array', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 22, count: 9 },
  GET_PRESSURE_DATA_EM: { type: 'uint16_array', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 16, count: 6 },
  GET_LIMPET_DATA_EM: { type: 'uint16_array', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 34, count: 15 },

  // Memory dump
  GET_MEMORY_DUMP_CHUNK_DATA: { type: 'raw', isPayloadNeeded: true, isLengthDetermined: false },

  // ACK-only commands
  MEMORY_DUMP_START: { type: 'ack', isPayloadNeeded: false, isLengthDetermined: false },
  MEMORY_DUMP_END: { type: 'ack', isPayloadNeeded: false, isLengthDetermined: false },
  MEMORY_ERASE_USED: { type: 'ack', isPayloadNeeded: false, isLengthDetermined: false },
  MEMORY_ERASE_ALL: { type: 'ack', isPayloadNeeded: false, isLengthDetermined: false },
  SET_PARAMETERS_INTO_FLASH: { type: 'ack', isPayloadNeeded: false, isLengthDetermined: false },
  LAUNCH_DEVICE: { type: 'ack', isPayloadNeeded: false, isLengthDetermined: false },
  START_VERIFICATION: { type: 'ack', isPayloadNeeded: false, isLengthDetermined: false },
  VERIFY_STATUS: { type: 'ack', isPayloadNeeded: false, isLengthDetermined: false },

  // Self test data
  GET_ACCEL_SELF_TEST_DATA: { type: 'self_test_accel', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 7 },
  GET_GYRO_SELF_TEST_DATA: { type: 'self_test_gyro', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 11 },
  GET_GYRO_ACCEL_SELF_TEST_DATA: { type: 'self_test_gyro_accel', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 11 },
  GET_PRESSURRE_SELF_TEST_DATA: { type: 'self_test_pressure', isPayloadNeeded: false, isLengthDetermined: true, responseLength: 5 },
};

// =====================================================
// Device Type Support Matrix
// =====================================================

var DEVICE_CAPABILITIES = {
  CM: {
    name: 'CM (Continuous Measurement)',
    sensors: ['rotational', 'lowShock', 'highShock', 'pressure', 'temperature'],
    hasEM: false,
    supportsFastDump: true,
    supportsEcc: true,
  },
  EM: {
    name: 'EM (Electronic Memory)',
    sensors: ['temperature', 'rotational', 'lowShock', 'pressure', 'limpet'],
    hasEM: true,
    supportsFastDump: false,
    supportsEcc: false,
  },
  Retina: {
    name: 'Retina',
    sensors: ['magnetometer', 'strain', 'pressure', 'temperature'],
    hasEM: true,
    supportsFastDump: true,
    supportsEcc: true,
  },
  RetinaMini: {
    name: 'Retina Mini',
    sensors: ['magnetometer', 'pressure', 'temperature'],
    hasEM: false,
    supportsFastDump: false,
    supportsEcc: false,
  },
};

// =====================================================
// Packet Helpers (same as legacy protocol)
// =====================================================

function buildCommandPacket(commandCode, dataBytes) {
  if (!dataBytes) dataBytes = [];
  var cmdlow = commandCode & 0xFF;
  var cmdhigh = (commandCode >> 8) & 0xFF;
  var len = dataBytes.length;
  var lengthlow = len & 0xFF;
  var lengthhigh = (len >> 8) & 0xFF;
  var packet = [cmdlow, cmdhigh, lengthlow, lengthhigh];
  for (var i = 0; i < dataBytes.length; i++) {
    packet.push(dataBytes[i]);
  }
  return Buffer.from(packet);
}

function parseResponse(buffer) {
  if (!buffer || buffer.length < 4) return null;
  var cmdlow = buffer[0];
  var cmdhigh = buffer[1];
  var commandCode = (cmdhigh << 8) | cmdlow;
  var lengthlow = buffer[2];
  var lengthhigh = buffer[3];
  var length = (lengthhigh << 8) | lengthlow;
  var data = buffer.slice(4, 4 + length);
  return { commandCode: commandCode, length: length, data: data };
}

function asciiToBytes(str) {
  if (!str) return [];
  var bytes = [];
  for (var i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i) & 0xFF);
  }
  return bytes;
}

function bytesToAscii(bytes) {
  if (!bytes || bytes.length === 0) return '';
  var str = '';
  for (var i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) break;
    str += String.fromCharCode(bytes[i]);
  }
  return str;
}

function hexStr(buf) {
  if (!buf) return '<null>';
  var parts = [];
  for (var i = 0; i < buf.length; i++) {
    parts.push(buf[i].toString(16).padStart(2, '0'));
  }
  return parts.join(', ');
}

// =====================================================
// ECC (Reed-Solomon) Support [STUB - needs implementation]
// =====================================================
// Based on DLL analysis: get_DataBytesPerPage, get_ParityBytesPerPage,
// get_BlocksPerPage, CorrectPage, EncodePage, EncodeSpecialRecordPage, ecc_rs_tt
//
// [NEEDS_CONFIRMATION] Exact RS parameters (symbolsize, ecc bytes, primitive polynomial)

var ECC_CONFIG = {
  enabled: false,  // Will be auto-detected per device
  dataBytesPerPage: 0,
  parityBytesPerPage: 0,
  blocksPerPage: 0,
};

/**
 * Decode a page with Reed-Solomon ECC.
 * [STUB] Returns data as-is until RS params are confirmed.
 */
function eccDecodePage(pageData) {
  // TODO: Implement Reed-Solomon decoding
  // Need to confirm: symbol size, number of ECC symbols, polynomial
  return { data: pageData, corrected: false, errors: 0 };
}

/**
 * Encode data with Reed-Solomon ECC.
 * [STUB] Returns data as-is.
 */
function eccEncodePage(data) {
  // TODO: Implement Reed-Solomon encoding
  return data;
}

// =====================================================
// FastDump Support [STUB - needs implementation]
// =====================================================
// Based on: START_FAST_MEMDUMP, SET_FAST_MEMDUMP_INDEX,
// DoFastDump, get_FastDumpsupport

function fastDumpSupported(deviceType) {
  var caps = DEVICE_CAPABILITIES[deviceType];
  return caps ? caps.supportsFastDump : false;
}

// =====================================================
// Export
// =====================================================

module.exports = {
  CMD: CMD,
  CMD_CONFIG: CMD_CONFIG,
  DEVICE_CAPABILITIES: DEVICE_CAPABILITIES,
  ECC_CONFIG: ECC_CONFIG,
  buildCommandPacket: buildCommandPacket,
  parseResponse: parseResponse,
  asciiToBytes: asciiToBytes,
  bytesToAscii: bytesToAscii,
  hexStr: hexStr,
  eccDecodePage: eccDecodePage,
  eccEncodePage: eccEncodePage,
  fastDumpSupported: fastDumpSupported,
};
