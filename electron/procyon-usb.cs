// Procyon USB Communication v5 - libusb0 (DeviceIoControl) + WinUSB fallback
// Compile: %WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe /out:procyon-usb.exe procyon-usb.cs
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

class ProcyonUsb
{
    #region Win32 API
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern SafeFileHandle CreateFile(string lpFileName, uint dwDesiredAccess, uint dwShareMode, IntPtr lpSecurityAttributes, uint dwCreationDisposition, uint dwFlagsAndAttributes, IntPtr hTemplateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool DeviceIoControl(SafeFileHandle hDevice, uint dwIoControlCode, byte[] lpInBuffer, uint nInBufferSize, byte[] lpOutBuffer, uint nOutBufferSize, out uint lpBytesReturned, IntPtr lpOverlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool DeviceIoControl(SafeFileHandle hDevice, uint dwIoControlCode, ref BULK_TRANSFER lpInBuffer, uint nInBufferSize, byte[] lpOutBuffer, uint nOutBufferSize, out uint lpBytesReturned, IntPtr lpOverlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool DeviceIoControl(SafeFileHandle hDevice, uint dwIoControlCode, byte[] lpInBuffer, uint nInBufferSize, ref BULK_TRANSFER lpOutBuffer, uint nOutBufferSize, out uint lpBytesReturned, IntPtr lpOverlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool DeviceIoControl(SafeFileHandle hDevice, uint dwIoControlCode, ref int lpInBuffer, uint nInBufferSize, IntPtr lpOutBuffer, uint nOutBufferSize, out uint lpBytesReturned, IntPtr lpOverlapped);

    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern IntPtr SetupDiGetClassDevs(ref Guid ClassGuid, IntPtr Enumerator, IntPtr hwndParent, uint Flags);

    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern bool SetupDiEnumDeviceInterfaces(IntPtr DeviceInfoSet, IntPtr DeviceInfoData, ref Guid InterfaceClassGuid, uint MemberIndex, ref SP_DEVICE_INTERFACE_DATA DeviceInterfaceData);

    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr DeviceInfoSet, ref SP_DEVICE_INTERFACE_DATA DeviceInterfaceData, IntPtr DeviceInterfaceDetailData, uint DeviceInterfaceDetailDataSize, ref uint RequiredSize, IntPtr DeviceInfoData);

    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr DeviceInfoSet, ref SP_DEVICE_INTERFACE_DATA DeviceInterfaceData, ref SP_DEVICE_INTERFACE_DETAIL_DATA DeviceInterfaceDetailData, uint DeviceInterfaceDetailDataSize, ref uint RequiredSize, IntPtr DeviceInfoData);

    [DllImport("setupapi.dll", SetLastError = true)]
    static extern bool SetupDiDestroyDeviceInfoList(IntPtr DeviceInfoSet);

    [StructLayout(LayoutKind.Sequential)]
    struct SP_DEVICE_INTERFACE_DATA
    {
        public int cbSize;
        public Guid InterfaceClassGuid;
        public int Flags;
        public IntPtr Reserved;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    struct SP_DEVICE_INTERFACE_DETAIL_DATA
    {
        public int cbSize;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string DevicePath;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    struct BULK_TRANSFER
    {
        public int Timeout;
        public int Endpoint;
    }

    const uint GENERIC_READ = 0x80000000;
    const uint GENERIC_WRITE = 0x40000000;
    const uint FILE_SHARE_READ = 1;
    const uint FILE_SHARE_WRITE = 2;
    const uint OPEN_EXISTING = 3;
    const uint FILE_FLAG_OVERLAPPED = 0x40000000;

    // libusb0 DeviceIoControl codes
    // CTL_CODE(LIBUSB_DEVICE_TYPE=0x8000, Function, Method, Access)
    // = (0x8000 << 16) | (Access << 14) | (Function << 2) | Method
    const uint IOCTL_SET_CONFIGURATION = 0x8002200C;  // 0x803, METHOD_BUFFERED
    const uint IOCTL_GET_CONFIGURATION = 0x80022008;  // 0x802
    const uint IOCTL_CLAIM_INTERFACE   = 0x80022010;  // 0x804, METHOD_BUFFERED
    const uint IOCTL_RELEASE_INTERFACE = 0x80022014;  // 0x805
    const uint IOCTL_SET_INTERFACE     = 0x80022018;  // 0x806, METHOD_BUFFERED
    const uint IOCTL_BULK_READ         = 0x80022020;  // 0x808, METHOD_BUFFERED
    const uint IOCTL_BULK_WRITE        = 0x80022024;  // 0x809, METHOD_BUFFERED
    const uint IOCTL_RESET_DEVICE      = 0x80022040;  // 0x810

    // GUIDs
    static readonly Guid GUID_DEVINTERFACE_LIBUSB0_DEVICE = new Guid("0bda4bb5-9cfd-4571-9190-e01a1948aebf");
    static readonly Guid GUID_DEVINTERFACE_WINUSB = new Guid("dee824ef-729b-4a0e-9c14-b7117d33a817");
    static readonly Guid GUID_DEVINTERFACE_USB_DEVICE = new Guid("A5DCBF10-6530-11D2-901F-00C04FB951ED");

    const int VID = 0x2269;
    const int PID = 0xBEEF;
    const byte EP_OUT = 0x01;
    const byte EP_IN = 0x81;
    const byte INTERFACE_NUMBER = 1;  // From config descriptor: bInterfaceNumber=1
    #endregion

    static SafeFileHandle deviceHandle;
    static bool isLibusb0;
    static IntPtr winUsbHandle;

    #region WinUSB API (fallback)
    [DllImport("winusb.dll", SetLastError = true)]
    static extern bool WinUsb_Initialize(SafeFileHandle InterfaceHandle, out IntPtr UsbHandle);
    [DllImport("winusb.dll", SetLastError = true)]
    static extern bool WinUsb_Free(IntPtr UsbHandle);
    [DllImport("winusb.dll", SetLastError = true)]
    static extern bool WinUsb_WritePipe(IntPtr UsbHandle, byte PipeID, byte[] Buffer, int BufferLength, out int LengthTransferred, IntPtr Overlapped);
    [DllImport("winusb.dll", SetLastError = true)]
    static extern bool WinUsb_ReadPipe(IntPtr UsbHandle, byte PipeID, byte[] Buffer, int BufferLength, out int LengthTransferred, IntPtr Overlapped);
    [DllImport("winusb.dll", SetLastError = true)]
    static extern bool WinUsb_ControlTransfer(IntPtr UsbHandle, WINUSB_SETUP_PACKET SetupPacket, byte[] Buffer, int BufferLength, out int LengthTransferred, IntPtr Overlapped);

    [StructLayout(LayoutKind.Sequential)]
    struct WINUSB_SETUP_PACKET
    {
        public byte RequestType; public byte Request; public short Value; public short Index; public short Length;
    }
    #endregion

    static List<string> FindDevicePaths()
    {
        var paths = new List<string>();
        var guids = new[] {
            new { Guid = GUID_DEVINTERFACE_LIBUSB0_DEVICE, Name = "libusb0" },
            new { Guid = GUID_DEVINTERFACE_WINUSB, Name = "WinUSB" },
            new { Guid = GUID_DEVINTERFACE_USB_DEVICE, Name = "USBDevice" }
        };

        foreach (var g in guids)
        {
            var found = EnumDevicePaths(g.Guid);
            foreach (var p in found)
            {
                if (p.IndexOf("vid_2269", StringComparison.OrdinalIgnoreCase) >= 0 &&
                    p.IndexOf("pid_beef", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    paths.Add(p);
                }
            }
        }
        return paths;
    }

    static List<string> EnumDevicePaths(Guid classGuid)
    {
        var result = new List<string>();
        IntPtr hInfo = SetupDiGetClassDevs(ref classGuid, IntPtr.Zero, IntPtr.Zero, 0x12);
        if (hInfo == (IntPtr)(-1)) return result;

        uint index = 0;
        while (true)
        {
            var ifaceData = new SP_DEVICE_INTERFACE_DATA();
            ifaceData.cbSize = Marshal.SizeOf(ifaceData);
            if (!SetupDiEnumDeviceInterfaces(hInfo, IntPtr.Zero, ref classGuid, index, ref ifaceData)) break;

            uint requiredSize = 0;
            SetupDiGetDeviceInterfaceDetail(hInfo, ref ifaceData, IntPtr.Zero, 0, ref requiredSize, IntPtr.Zero);
            if (requiredSize == 0) { index++; continue; }

            var detailData = new SP_DEVICE_INTERFACE_DETAIL_DATA();
            detailData.cbSize = IntPtr.Size == 8 ? 8 : 5 + Marshal.SystemDefaultCharSize;
            if (SetupDiGetDeviceInterfaceDetail(hInfo, ref ifaceData, ref detailData, requiredSize, ref requiredSize, IntPtr.Zero))
            {
                result.Add(detailData.DevicePath);
            }
            index++;
        }
        SetupDiDestroyDeviceInfoList(hInfo);
        return result;
    }

    static bool Connect()
    {
        var paths = FindDevicePaths();
        if (paths.Count == 0)
        {
            Console.Error.WriteLine("No Procyon device found!");
            return false;
        }

        foreach (var path in paths)
        {
            bool isLibusbPath = path.IndexOf(GUID_DEVINTERFACE_LIBUSB0_DEVICE.ToString(), StringComparison.OrdinalIgnoreCase) >= 0;

            // Try libusb0 first
            if (TryConnectLibusb0(path))
            {
                isLibusb0 = true;
                return true;
            }

            // Try WinUSB
            if (TryConnectWinUSB(path))
            {
                isLibusb0 = false;
                return true;
            }
        }

        Console.Error.WriteLine("All connection methods failed!");
        return false;
    }

    static bool TryConnectLibusb0(string path)
    {
        try
        {
            var handle = CreateFile(path, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
            if (handle.IsInvalid) return false;

            // Set configuration (may fail if already configured, continue anyway)
            uint bytesReturned;
            int configValue = 1;
            if (!DeviceIoControl(handle, IOCTL_SET_CONFIGURATION, ref configValue, 4, IntPtr.Zero, 0, out bytesReturned, IntPtr.Zero))
            {
                int err = Marshal.GetLastWin32Error();
                Console.WriteLine("  SetConfiguration WARNING: err=" + err + " (continuing)");
            }

            // Claim interface
            int ifaceNum = INTERFACE_NUMBER;
            if (!DeviceIoControl(handle, IOCTL_CLAIM_INTERFACE, ref ifaceNum, 4, IntPtr.Zero, 0, out bytesReturned, IntPtr.Zero))
            {
                int err = Marshal.GetLastWin32Error();
                handle.Dispose();
                return false;
            }

            deviceHandle = handle;
            isLibusb0 = true;
            return true;
        }
        catch { return false; }
    }

    static bool TryConnectWinUSB(string path)
    {
        try
        {
            var handle = CreateFile(path, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, IntPtr.Zero);
            if (handle.IsInvalid) return false;

            if (!WinUsb_Initialize(handle, out winUsbHandle))
            {
                handle.Dispose();
                return false;
            }

            deviceHandle = handle;
            isLibusb0 = false;
            return true;
        }
        catch { return false; }
    }

    static void Disconnect()
    {
        if (isLibusb0 && !deviceHandle.IsInvalid)
        {
            uint bytesReturned;
            int ifaceNum = INTERFACE_NUMBER;
            DeviceIoControl(deviceHandle, IOCTL_RELEASE_INTERFACE, ref ifaceNum, 4, IntPtr.Zero, 0, out bytesReturned, IntPtr.Zero);
        }
        if (!isLibusb0 && winUsbHandle != IntPtr.Zero)
        {
            WinUsb_Free(winUsbHandle);
            winUsbHandle = IntPtr.Zero;
        }
        if (!deviceHandle.IsInvalid) deviceHandle.Dispose();
        deviceHandle = null;
    }

    static int BulkWrite(byte[] data, int length)
    {
        if (isLibusb0)
        {
            BULK_TRANSFER bt;
            bt.Timeout = 5000;
            bt.Endpoint = EP_OUT;

            byte[] inBuf = new byte[length];
            Array.Copy(data, inBuf, length);

            uint bytesReturned;
            if (!DeviceIoControl(deviceHandle, IOCTL_BULK_WRITE, ref bt, (uint)Marshal.SizeOf(typeof(BULK_TRANSFER)), inBuf, (uint)length, out bytesReturned, IntPtr.Zero))
            {
                return -Marshal.GetLastWin32Error();
            }
            return length;
        }
        else
        {
            int transferred;
            if (!WinUsb_WritePipe(winUsbHandle, EP_OUT, data, length, out transferred, IntPtr.Zero))
                return -Marshal.GetLastWin32Error();
            return transferred;
        }
    }

    static int BulkRead(byte[] buffer, int maxLength, int timeout = 5000)
    {
        if (isLibusb0)
        {
            BULK_TRANSFER bt;
            bt.Timeout = timeout;
            bt.Endpoint = EP_IN;

            uint bytesReturned;
            if (!DeviceIoControl(deviceHandle, IOCTL_BULK_READ, ref bt, (uint)Marshal.SizeOf(typeof(BULK_TRANSFER)), buffer, (uint)maxLength, out bytesReturned, IntPtr.Zero))
            {
                return -Marshal.GetLastWin32Error();
            }
            return (int)bytesReturned;
        }
        else
        {
            int transferred;
            if (!WinUsb_ReadPipe(winUsbHandle, EP_IN, buffer, maxLength, out transferred, IntPtr.Zero))
                return -Marshal.GetLastWin32Error();
            return transferred;
        }
    }

    static int SendRead(byte[] cmd, int cmdLen, byte[] resp, int respMaxLen, int timeout = 5000)
    {
        int written = BulkWrite(cmd, cmdLen);
        if (written < 0) return written;

        Thread.Sleep(100);  // Give device time to process
        return BulkRead(resp, respMaxLen, timeout);
    }

    static byte[] BuildCommand(byte cmdCode)
    {
        byte[] cmd = new byte[64];
        for (int i = 0; i < 64; i++) cmd[i] = 0xFF;
        cmd[0] = cmdCode;
        return cmd;
    }

    static byte[] BuildCommand(byte cmdCode, byte[] data)
    {
        byte[] cmd = new byte[64];
        for (int i = 0; i < 64; i++) cmd[i] = 0xFF;
        cmd[0] = cmdCode;
        if (data != null)
        {
            for (int i = 0; i < data.Length && i + 1 < 64; i++)
                cmd[i + 1] = data[i];
        }
        return cmd;
    }

    static void OutputJson(string json)
    {
        Console.WriteLine(json);
    }

    static void Main(string[] args)
    {
        if (args.Length == 0)
        {
            Console.WriteLine("Procyon USB Bridge v5 (libusb0 + WinUSB)");
            Console.WriteLine("Commands: find connect disconnect send read sendread test diag drivers");
            return;
        }

        string command = args[0].ToLower();

        try
        {
            switch (command)
            {
                case "find": CmdFind(); break;
                case "connect": CmdConnect(); break;
                case "disconnect": CmdDisconnect(); break;
                case "send": CmdSend(args); break;
                case "read": CmdRead(); break;
                case "sendread": CmdSendRead(args); break;
                case "test": CmdTest(); break;
                case "diag": CmdDiag(); break;
                case "drivers": CmdDrivers(); break;
                default:
                    Console.Error.WriteLine("Unknown command: " + args[0]);
                    break;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("ERROR: " + ex.Message);
        }
    }

    static void CmdFind()
    {
        var paths = FindDevicePaths();
        if (paths.Count == 0)
        {
            OutputJson("{\"found\":false}");
        }
        else
        {
            OutputJson("{\"found\":true,\"path\":\"" + paths[0] + "\",\"count\":" + paths.Count + "}");
        }
    }

    static void CmdConnect()
    {
        if (Connect())
        {
            OutputJson("{\"connected\":true,\"method\":\"" + (isLibusb0 ? "libusb0" : "WinUSB") + "\"}");
        }
        else
        {
            OutputJson("{\"connected\":false}");
        }
    }

    static void CmdDisconnect()
    {
        Disconnect();
        OutputJson("{\"disconnected\":true}");
    }

    static void CmdSend(string[] args)
    {
        if (args.Length < 2) { Console.Error.WriteLine("Usage: send <hexBytes>"); return; }
        string[] hexParts = args[1].Split(new[] { ' ', ',' }, StringSplitOptions.RemoveEmptyEntries);
        byte[] data = new byte[hexParts.Length];
        for (int i = 0; i < hexParts.Length; i++) data[i] = Convert.ToByte(hexParts[i], 16);

        int written = BulkWrite(data, data.Length);
        if (written > 0)
            OutputJson("{\"sent\":" + written + "}");
        else
            OutputJson("{\"error\":\"Write failed\",\"winError\":" + (-written) + "}");
    }

    static void CmdRead()
    {
        byte[] buf = new byte[512];
        int read = BulkRead(buf, 512, 5000);
        if (read > 0)
        {
            string hex = BitConverter.ToString(buf, 0, Math.Min(read, 256)).Replace("-", "");
            OutputJson("{\"read\":" + read + ",\"data\":\"" + hex + "\"}");
        }
        else
        {
            OutputJson("{\"error\":\"Read failed\",\"winError\":" + (-read) + "}");
        }
    }

    static void CmdSendRead(string[] args)
    {
        if (args.Length < 2) { Console.Error.WriteLine("Usage: sendread <hexBytes>"); return; }
        string[] hexParts = args[1].Split(new[] { ' ', ',' }, StringSplitOptions.RemoveEmptyEntries);
        byte[] cmdData = new byte[hexParts.Length];
        for (int i = 0; i < hexParts.Length; i++) cmdData[i] = Convert.ToByte(hexParts[i], 16);

        byte[] cmd = new byte[64];
        for (int i = 0; i < 64; i++) cmd[i] = 0xFF;
        for (int i = 0; i < cmdData.Length && i < 64; i++) cmd[i] = cmdData[i];

        byte[] resp = new byte[512];
        int result = SendRead(cmd, 64, resp, 512, 5000);
        if (result > 0)
        {
            string hex = BitConverter.ToString(resp, 0, Math.Min(result, 256)).Replace("-", "");
            OutputJson("{\"sent\":64,\"read\":" + result + ",\"data\":\"" + hex + "\"}");
        }
        else
        {
            OutputJson("{\"error\":\"SendRead failed\",\"winError\":" + (-result) + "}");
        }
    }

    static void CmdTest()
    {
        Console.WriteLine("=== Procyon USB Test ===\n");

        // Find paths
        var paths = FindDevicePaths();
        Console.WriteLine("Found " + paths.Count + " device path(s)\n");

        if (paths.Count == 0)
        {
            Console.WriteLine("No Procyon device found! Check USB cable and driver.");
            return;
        }

        foreach (var path in paths)
        {
            string driverType = "Unknown";
            if (path.IndexOf(GUID_DEVINTERFACE_LIBUSB0_DEVICE.ToString(), StringComparison.OrdinalIgnoreCase) >= 0)
                driverType = "libusb0";
            else if (path.IndexOf(GUID_DEVINTERFACE_WINUSB.ToString(), StringComparison.OrdinalIgnoreCase) >= 0)
                driverType = "WinUSB";
            else if (path.IndexOf(GUID_DEVINTERFACE_USB_DEVICE.ToString(), StringComparison.OrdinalIgnoreCase) >= 0)
                driverType = "USBDevice";

            bool hasMi = path.IndexOf("&mi_", StringComparison.OrdinalIgnoreCase) >= 0;
            Console.WriteLine("--- [" + driverType + "] " + (hasMi ? "[CHILD]" : "[PARENT]") + " ---");
            Console.WriteLine("  Path: " + path);

            // Try libusb0 connection
            if (driverType == "libusb0" || driverType == "USBDevice")
            {
                Console.WriteLine("  Trying libusb0 (DeviceIoControl)...");
                if (TestLibusb0(path))
                {
                    Console.WriteLine("\n=== SUCCESS via libusb0! ===");
                    return;
                }
            }

            // Try WinUSB connection
            if (driverType == "WinUSB")
            {
                Console.WriteLine("  Trying WinUSB...");
                if (TestWinUsb(path))
                {
                    Console.WriteLine("\n=== SUCCESS via WinUSB! ===");
                    return;
                }
            }

            Console.WriteLine();
        }

        Console.WriteLine("All paths failed! Run 'procyon-usb.exe diag' for details.");
    }

    static bool TestLibusb0(string path)
    {
        var handle = CreateFile(path, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
        if (handle.IsInvalid)
        {
            Console.WriteLine("  CreateFile FAILED: err=" + Marshal.GetLastWin32Error());
            return false;
        }
        Console.WriteLine("  CreateFile OK");

        uint bytesReturned;

        // Set configuration
        int configValue = 1;
        if (!DeviceIoControl(handle, IOCTL_SET_CONFIGURATION, ref configValue, 4, IntPtr.Zero, 0, out bytesReturned, IntPtr.Zero))
        {
            int setConfErr = Marshal.GetLastWin32Error();
            Console.WriteLine("  SetConfiguration WARNING: err=" + setConfErr + " (continuing anyway)");
        }
        else
        {
            Console.WriteLine("  SetConfiguration(1) OK");
        }

        // Try claiming interface 0 first, then 1
        int claimIface = -1;
        foreach (int tryIface in new[] { 0, 1 })
        {
            int ifaceNum = tryIface;
            if (DeviceIoControl(handle, IOCTL_CLAIM_INTERFACE, ref ifaceNum, 4, IntPtr.Zero, 0, out bytesReturned, IntPtr.Zero))
            {
                claimIface = tryIface;
                Console.WriteLine("  ClaimInterface(" + tryIface + ") OK");
                break;
            }
            else
            {
                Console.WriteLine("  ClaimInterface(" + tryIface + ") FAILED: err=" + Marshal.GetLastWin32Error());
            }
        }

        if (claimIface < 0)
        {
            handle.Dispose();
            return false;
        }

        // Set interface alternate setting
        int altData = claimIface;  // Interface number for SET_INTERFACE
        // IOCTL_SET_INTERFACE uses a struct: {interface_number, alternate_setting}
        byte[] setIfaceBuf = new byte[8];
        BitConverter.GetBytes(claimIface).CopyTo(setIfaceBuf, 0);
        BitConverter.GetBytes(0).CopyTo(setIfaceBuf, 4);
        if (!DeviceIoControl(handle, IOCTL_SET_INTERFACE, setIfaceBuf, 8, setIfaceBuf, 0, out bytesReturned, IntPtr.Zero))
        {
            Console.WriteLine("  SetInterface FAILED: err=" + Marshal.GetLastWin32Error() + " (continuing)");
        }
        else
        {
            Console.WriteLine("  SetInterface(" + claimIface + ", alt=0) OK");
        }

        // Send GET_FIRMWARE_VERSION command (0x01, 0xFF padded)
        byte[] cmd = BuildCommand(0x01);
        BULK_TRANSFER writeBt;
        writeBt.Timeout = 5000;
        writeBt.Endpoint = EP_OUT;

        if (!DeviceIoControl(handle, IOCTL_BULK_WRITE, ref writeBt, (uint)Marshal.SizeOf(typeof(BULK_TRANSFER)), cmd, 64, out bytesReturned, IntPtr.Zero))
        {
            Console.WriteLine("  BulkWrite FAILED: err=" + Marshal.GetLastWin32Error());
            int relIface = claimIface;
            DeviceIoControl(handle, IOCTL_RELEASE_INTERFACE, ref relIface, 4, IntPtr.Zero, 0, out bytesReturned, IntPtr.Zero);
            handle.Dispose();
            return false;
        }
        Console.WriteLine("  BulkWrite(0x01 GET_FW_VER) OK (64 bytes)");

        // Read response with 5s timeout
        Thread.Sleep(100);
        BULK_TRANSFER readBt;
        readBt.Timeout = 5000;
        readBt.Endpoint = EP_IN;

        byte[] buffer = new byte[512];
        if (!DeviceIoControl(handle, IOCTL_BULK_READ, ref readBt, (uint)Marshal.SizeOf(typeof(BULK_TRANSFER)), buffer, 512, out bytesReturned, IntPtr.Zero))
        {
            int err = Marshal.GetLastWin32Error();
            Console.WriteLine("  BulkRead FAILED: err=" + err);
            int relIface = claimIface;
            DeviceIoControl(handle, IOCTL_RELEASE_INTERFACE, ref relIface, 4, IntPtr.Zero, 0, out bytesReturned, IntPtr.Zero);
            handle.Dispose();
            return false;
        }

        Console.WriteLine("  BulkRead OK (" + bytesReturned + " bytes)");
        Console.WriteLine("  Data: " + BitConverter.ToString(buffer, 0, Math.Min((int)bytesReturned, 32)).Replace("-", " "));

        // Check for 0xA5 response header
        if (bytesReturned > 0 && buffer[0] == 0xA5)
        {
            Console.WriteLine("  >>> VALID RESPONSE (0xA5 header)!");
        }

        // Release
        int relIface2 = claimIface;
        DeviceIoControl(handle, IOCTL_RELEASE_INTERFACE, ref relIface2, 4, IntPtr.Zero, 0, out bytesReturned, IntPtr.Zero);
        handle.Dispose();
        return true;
    }

    static bool TestWinUsb(string path)
    {
        var handle = CreateFile(path, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, IntPtr.Zero);
        if (handle.IsInvalid)
        {
            Console.WriteLine("  CreateFile FAILED: err=" + Marshal.GetLastWin32Error());
            return false;
        }
        Console.WriteLine("  CreateFile OK");

        IntPtr wuHandle;
        if (!WinUsb_Initialize(handle, out wuHandle))
        {
            Console.WriteLine("  WinUsb_Initialize FAILED: err=" + Marshal.GetLastWin32Error());
            handle.Dispose();
            return false;
        }
        Console.WriteLine("  WinUsb_Initialize OK");

        byte[] cmd = BuildCommand(0x01);
        int sent;
        if (!WinUsb_WritePipe(wuHandle, EP_OUT, cmd, 64, out sent, IntPtr.Zero))
        {
            Console.WriteLine("  WritePipe FAILED: err=" + Marshal.GetLastWin32Error());
            WinUsb_Free(wuHandle);
            handle.Dispose();
            return false;
        }
        Console.WriteLine("  WritePipe OK (" + sent + " bytes)");

        byte[] buffer = new byte[64];
        int read;
        if (!WinUsb_ReadPipe(wuHandle, EP_IN, buffer, 64, out read, IntPtr.Zero))
        {
            Console.WriteLine("  ReadPipe FAILED: err=" + Marshal.GetLastWin32Error());
            WinUsb_Free(wuHandle);
            handle.Dispose();
            return false;
        }

        Console.WriteLine("  ReadPipe OK (" + read + " bytes)");
        Console.WriteLine("  Data: " + BitConverter.ToString(buffer, 0, Math.Min(read, 32)).Replace("-", " "));

        WinUsb_Free(wuHandle);
        handle.Dispose();
        return true;
    }

    static void CmdDiag()
    {
        Console.WriteLine("=== Procyon USB Diagnostic ===\n");

        // Check all GUIDs
        var checks = new[] {
            new { Guid = GUID_DEVINTERFACE_LIBUSB0_DEVICE, Name = "libusb0 Device" },
            new { Guid = GUID_DEVINTERFACE_WINUSB, Name = "WinUSB" },
            new { Guid = GUID_DEVINTERFACE_USB_DEVICE, Name = "USBDevice" }
        };

        foreach (var check in checks)
        {
            var paths = EnumDevicePaths(check.Guid);
            var procyonPaths = new List<string>();
            foreach (var p in paths)
            {
                if (p.IndexOf("vid_2269", StringComparison.OrdinalIgnoreCase) >= 0 &&
                    p.IndexOf("pid_beef", StringComparison.OrdinalIgnoreCase) >= 0)
                    procyonPaths.Add(p);
            }

            Console.WriteLine("--- " + check.Name + " ---");
            if (procyonPaths.Count == 0)
                Console.WriteLine("  No Procyon paths");
            foreach (var p in procyonPaths)
            {
                bool hasMi = p.IndexOf("&mi_", StringComparison.OrdinalIgnoreCase) >= 0;
                Console.WriteLine("  " + p + (hasMi ? " [CHILD]" : " [PARENT]"));
            }
            Console.WriteLine();
        }

        // Driver recommendation
        Console.WriteLine("=== Recommendation ===");
        Console.WriteLine("For best compatibility, install libusb-win32 via Zadig on the Procyon device.");
        Console.WriteLine("Original Procyon software uses libusb0 driver (LibUsbDotNet.LibUsb backend).");
    }

    static void CmdDrivers()
    {
        Console.WriteLine("=== Procyon USB Driver Info ===\n");

        var checks = new[] {
            new { Guid = GUID_DEVINTERFACE_LIBUSB0_DEVICE, Name = "libusb0" },
            new { Guid = GUID_DEVINTERFACE_WINUSB, Name = "WinUSB" },
            new { Guid = GUID_DEVINTERFACE_USB_DEVICE, Name = "USBDevice" }
        };

        foreach (var check in checks)
        {
            var paths = EnumDevicePaths(check.Guid);
            var procyonPaths = new List<string>();
            foreach (var p in paths)
            {
                if (p.IndexOf("vid_2269", StringComparison.OrdinalIgnoreCase) >= 0 &&
                    p.IndexOf("pid_beef", StringComparison.OrdinalIgnoreCase) >= 0)
                    procyonPaths.Add(p);
            }

            Console.WriteLine("[" + check.Name + "] " + procyonPaths.Count + " Procyon path(s)");
            foreach (var p in procyonPaths)
                Console.WriteLine("  " + p);
            Console.WriteLine();
        }
    }
}
