// Procyon USB Communication via WinUSB (bypasses libusb)
// Compile: %WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe /out:procyon-usb.exe procyon-usb.cs
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

class ProcyonUsb
{
    // === P/Invoke Declarations ===
    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern IntPtr SetupDiGetClassDevs(ref Guid ClassGuid, IntPtr Enumerator, IntPtr hwndParent, int Flags);

    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern IntPtr SetupDiGetClassDevs(IntPtr ClassGuid, string Enumerator, IntPtr hwndParent, int Flags);

    [DllImport("setupapi.dll", SetLastError = true)]
    static extern bool SetupDiEnumDeviceInterfaces(IntPtr DeviceInfoSet, IntPtr DeviceInfoData, ref Guid InterfaceClassGuid, int MemberIndex, ref SP_DEVICE_INTERFACE_DATA DeviceInterfaceData);

    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr DeviceInfoSet, ref SP_DEVICE_INTERFACE_DATA DeviceInterfaceData, IntPtr DeviceInterfaceDetailData, int DeviceInterfaceDetailDataSize, ref int RequiredSize, IntPtr DeviceInfoData);

    [DllImport("setupapi.dll", SetLastError = true)]
    static extern bool SetupDiEnumDeviceInfo(IntPtr DeviceInfoSet, int MemberIndex, ref SP_DEVINFO_DATA DeviceInfoData);

    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern bool SetupDiGetDeviceRegistryProperty(IntPtr DeviceInfoSet, ref SP_DEVINFO_DATA DeviceInfoData, int Property, ref int PropertyRegDataType, byte[] PropertyBuffer, int PropertyBufferSize, ref int RequiredSize);

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

    [StructLayout(LayoutKind.Sequential)]
    struct SP_DEVINFO_DATA
    {
        public int cbSize;
        public Guid ClassGuid;
        public int DevInst;
        public IntPtr Reserved;
    }

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern SafeFileHandle CreateFile(string lpFileName, uint dwDesiredAccess, int dwShareMode, IntPtr lpSecurityAttributes, int dwCreationDisposition, int dwFlagsAndAttributes, IntPtr hTemplateFile);

    [DllImport("winusb.dll", SetLastError = true)]
    static extern bool WinUsb_Initialize(SafeFileHandle DeviceHandle, out IntPtr UsbHandle);

    [DllImport("winusb.dll", SetLastError = true)]
    static extern bool WinUsb_Free(IntPtr UsbHandle);

    [DllImport("winusb.dll", SetLastError = true)]
    static extern bool WinUsb_WritePipe(IntPtr UsbHandle, byte PipeID, byte[] Buffer, int BufferLength, out int LengthTransferred, IntPtr Overlapped);

    [DllImport("winusb.dll", SetLastError = true)]
    static extern bool WinUsb_ReadPipe(IntPtr UsbHandle, byte PipeID, byte[] Buffer, int BufferLength, out int LengthTransferred, IntPtr Overlapped);

    [DllImport("winusb.dll", SetLastError = true)]
    static extern bool WinUsb_QueryPipe(IntPtr UsbHandle, byte AlternateInterfaceNumber, byte PipeIndex, out WINUSB_PIPE_INFORMATION PipeInformation);

    [DllImport("winusb.dll", SetLastError = true)]
    static extern bool WinUsb_SetPipePolicy(IntPtr UsbHandle, byte PipeID, uint PolicyType, uint ValueLength, ref uint Value);

    [StructLayout(LayoutKind.Sequential)]
    struct WINUSB_PIPE_INFORMATION
    {
        public byte PipeType;
        public byte PipeId;
        public short MaximumPacketSize;
        public byte Interval;
    }

    // === Constants ===
    const int DIGCF_PRESENT = 0x02;
    const int DIGCF_DEVICEINTERFACE = 0x10;
    const int DIGCF_ALLCLASSES = 0x04;
    const uint GENERIC_READ = 0x80000000;
    const uint GENERIC_WRITE = 0x40000000;
    const int FILE_SHARE_READ = 0x01;
    const int FILE_SHARE_WRITE = 0x02;
    const int OPEN_EXISTING = 3;
    const uint SHORT_TIMEOUT_POLICY = 0x03;

    const int SPDRP_HARDWAREID = 0x00000001;
    const int SPDRP_SERVICE = 0x00000004;
    const int SPDRP_CLASS = 0x00000007;
    const int SPDRP_FRIENDLYNAME = 0x0000000C;
    const int SPDRP_DEVICEDESC = 0x00000000;

    static Guid winusbGuid;

    static ProcyonUsb()
    {
        winusbGuid = new Guid("dee824ef-729b-4a0e-9c14-b7117d33a817");
    }

    static SafeFileHandle deviceHandle = null;
    static IntPtr winUsbHandle = IntPtr.Zero;
    static byte pipeIn = 0x81;
    static byte pipeOut = 0x01;

    static void Main(string[] args)
    {
        if (args.Length == 0) { WriteError("No command"); return; }
        try
        {
            switch (args[0].ToLower())
            {
                case "find": FindDevice(); break;
                case "connect": Connect(); break;
                case "disconnect": Disconnect(); break;
                case "send":
                    if (args.Length < 2) { WriteError("No data"); return; }
                    SendData(args[1]); break;
                case "read":
                    ReadData(args.Length > 1 ? int.Parse(args[1]) : 64,
                             args.Length > 2 ? int.Parse(args[2]) : 3000); break;
                case "sendread":
                    if (args.Length < 2) { WriteError("No data"); return; }
                    SendAndRead(args[1], args.Length > 2 ? int.Parse(args[2]) : 3000); break;
                case "list": ListDevices(); break;
                case "diag": RunDiag(); break;
                case "test": RunTest(); break;
                default: WriteError("Unknown command: " + args[0]); break;
            }
        }
        catch (Exception ex)
        {
            WriteError(ex.Message);
        }
    }

    static void WriteJson(string json)
    {
        Console.WriteLine(json);
        Console.Out.Flush();
    }

    static void WriteError(string msg)
    {
        WriteJson("{\"error\":\"" + msg.Replace("\"", "\\\"") + "\",\"winError\":" + Marshal.GetLastWin32Error() + "}");
    }

    // === Enumerate all Procyon WinUSB device paths ===
    static List<string> FindAllDevicePaths()
    {
        List<string> paths = new List<string>();
        IntPtr hDevInfo = SetupDiGetClassDevs(ref winusbGuid, IntPtr.Zero, IntPtr.Zero,
            DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
        if (hDevInfo == (IntPtr)(-1)) return paths;

        try
        {
            int index = 0;
            while (true)
            {
                SP_DEVICE_INTERFACE_DATA ifaceData = new SP_DEVICE_INTERFACE_DATA();
                ifaceData.cbSize = Marshal.SizeOf(ifaceData);

                if (!SetupDiEnumDeviceInterfaces(hDevInfo, IntPtr.Zero, ref winusbGuid, index, ref ifaceData))
                    break;

                int requiredSize = 0;
                SetupDiGetDeviceInterfaceDetail(hDevInfo, ref ifaceData, IntPtr.Zero, 0, ref requiredSize, IntPtr.Zero);

                IntPtr detailData = Marshal.AllocHGlobal(requiredSize);
                try
                {
                    Marshal.WriteInt32(detailData, IntPtr.Size == 8 ? 8 : 4);
                    if (SetupDiGetDeviceInterfaceDetail(hDevInfo, ref ifaceData, detailData, requiredSize, ref requiredSize, IntPtr.Zero))
                    {
                        string path = Marshal.PtrToStringAuto(detailData + 4);
                        if (path != null && path.IndexOf("2269", StringComparison.OrdinalIgnoreCase) >= 0 &&
                            path.IndexOf("beef", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            paths.Add(path);
                        }
                    }
                }
                finally { Marshal.FreeHGlobal(detailData); }
                index++;
            }
        }
        finally { SetupDiDestroyDeviceInfoList(hDevInfo); }
        return paths;
    }

    static string FindDevicePath()
    {
        List<string> paths = FindAllDevicePaths();
        return paths.Count > 0 ? paths[0] : null;
    }

    // === List ALL WinUSB devices on system ===
    static void ListDevices()
    {
        List<string> allPaths = new List<string>();
        IntPtr hDevInfo = SetupDiGetClassDevs(ref winusbGuid, IntPtr.Zero, IntPtr.Zero,
            DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
        if (hDevInfo == (IntPtr)(-1)) { WriteJson("{\"error\":\"SetupDiGetClassDevs failed\"}"); return; }

        try
        {
            int index = 0;
            while (true)
            {
                SP_DEVICE_INTERFACE_DATA ifaceData = new SP_DEVICE_INTERFACE_DATA();
                ifaceData.cbSize = Marshal.SizeOf(ifaceData);

                if (!SetupDiEnumDeviceInterfaces(hDevInfo, IntPtr.Zero, ref winusbGuid, index, ref ifaceData))
                    break;

                int requiredSize = 0;
                SetupDiGetDeviceInterfaceDetail(hDevInfo, ref ifaceData, IntPtr.Zero, 0, ref requiredSize, IntPtr.Zero);

                IntPtr detailData = Marshal.AllocHGlobal(requiredSize);
                try
                {
                    Marshal.WriteInt32(detailData, IntPtr.Size == 8 ? 8 : 4);
                    if (SetupDiGetDeviceInterfaceDetail(hDevInfo, ref ifaceData, detailData, requiredSize, ref requiredSize, IntPtr.Zero))
                    {
                        string path = Marshal.PtrToStringAuto(detailData + 4);
                        if (path != null) allPaths.Add(path);
                    }
                }
                finally { Marshal.FreeHGlobal(detailData); }
                index++;
            }
        }
        finally { SetupDiDestroyDeviceInfoList(hDevInfo); }

        StringBuilder sb = new StringBuilder();
        sb.Append("{\"total\":").Append(allPaths.Count).Append(",\"procyon\":[");
        bool first = true;
        foreach (string p in allPaths)
        {
            if (p.IndexOf("2269", StringComparison.OrdinalIgnoreCase) >= 0 &&
                p.IndexOf("beef", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                if (!first) sb.Append(",");
                sb.Append("\"").Append(p.Replace("\\", "\\\\")).Append("\"");
                first = false;
            }
        }
        sb.Append("],\"all\":[");
        first = true;
        foreach (string p in allPaths)
        {
            if (!first) sb.Append(",");
            sb.Append("\"").Append(p.Replace("\\", "\\\\").Replace("\"", "\\\"")).Append("\"");
            first = false;
        }
        sb.Append("]}");
        Console.WriteLine(sb.ToString());
    }

    // === Diagnostic: enumerate all USB devices with VID_2269 and show driver info ===
    static void RunDiag()
    {
        Console.WriteLine("=== Procyon USB Diagnostic ===\n");

        // 1. Enumerate ALL USB devices with VID_2269 using hardware ID enumerator
        IntPtr hDevInfo = SetupDiGetClassDevs(IntPtr.Zero, "USB", IntPtr.Zero,
            DIGCF_PRESENT | DIGCF_ALLCLASSES);
        if (hDevInfo == (IntPtr)(-1))
        {
            Console.WriteLine("SetupDiGetClassDevs failed!");
            return;
        }

        try
        {
            int index = 0;
            int found = 0;
            while (true)
            {
                SP_DEVINFO_DATA devInfo = new SP_DEVINFO_DATA();
                devInfo.cbSize = Marshal.SizeOf(devInfo);

                if (!SetupDiEnumDeviceInfo(hDevInfo, index, ref devInfo))
                    break;

                // Read hardware ID
                string hwId = GetDeviceProperty(hDevInfo, ref devInfo, SPDRP_HARDWAREID);
                if (hwId != null && hwId.IndexOf("2269", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    found++;
                    string desc = GetDeviceProperty(hDevInfo, ref devInfo, SPDRP_DEVICEDESC);
                    string friendly = GetDeviceProperty(hDevInfo, ref devInfo, SPDRP_FRIENDLYNAME);
                    string svc = GetDeviceProperty(hDevInfo, ref devInfo, SPDRP_SERVICE);
                    string cls = GetDeviceProperty(hDevInfo, ref devInfo, SPDRP_CLASS);

                    Console.WriteLine("--- Procyon Device #" + found + " ---");
                    Console.WriteLine("  HardwareID: " + hwId);
                    Console.WriteLine("  Description: " + (desc ?? "(null)"));
                    Console.WriteLine("  FriendlyName: " + (friendly ?? "(null)"));
                    Console.WriteLine("  Driver Service: " + (svc ?? "(null)"));
                    Console.WriteLine("  Class: " + (cls ?? "(null)"));
                    Console.WriteLine();
                }
                index++;
            }

            if (found == 0)
                Console.WriteLine("No USB devices with VID_2269 found!");
        }
        finally { SetupDiDestroyDeviceInfoList(hDevInfo); }

        // 2. Show WinUSB interface paths
        Console.WriteLine("\n--- WinUSB Interface Paths ---");
        List<string> paths = FindAllDevicePaths();
        if (paths.Count == 0)
            Console.WriteLine("  No Procyon WinUSB paths found!");
        else
        {
            foreach (string p in paths)
            {
                bool hasMi = p.IndexOf("&mi_", StringComparison.OrdinalIgnoreCase) >= 0;
                Console.WriteLine("  " + p);
                Console.WriteLine("  -> Composite child (has &mi_): " + hasMi);
            }
        }

        // 3. Check if composite child paths exist
        Console.WriteLine("\n--- Checking Composite Child Paths ---");
        for (int mi = 0; mi <= 7; mi++)
        {
            string testPath = "\\\\?\\usb#vid_2269&pid_beef&mi_" + mi.ToString("D2");
            // Try to find any WinUSB path with this prefix
            IntPtr hDevInfo2 = SetupDiGetClassDevs(ref winusbGuid, IntPtr.Zero, IntPtr.Zero,
                DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
            if (hDevInfo2 != (IntPtr)(-1))
            {
                try
                {
                    int idx = 0;
                    while (true)
                    {
                        SP_DEVICE_INTERFACE_DATA ifaceData = new SP_DEVICE_INTERFACE_DATA();
                        ifaceData.cbSize = Marshal.SizeOf(ifaceData);
                        if (!SetupDiEnumDeviceInterfaces(hDevInfo2, IntPtr.Zero, ref winusbGuid, idx, ref ifaceData))
                            break;

                        int reqSize = 0;
                        SetupDiGetDeviceInterfaceDetail(hDevInfo2, ref ifaceData, IntPtr.Zero, 0, ref reqSize, IntPtr.Zero);
                        IntPtr detailData = Marshal.AllocHGlobal(reqSize);
                        try
                        {
                            Marshal.WriteInt32(detailData, IntPtr.Size == 8 ? 8 : 4);
                            if (SetupDiGetDeviceInterfaceDetail(hDevInfo2, ref ifaceData, detailData, reqSize, ref reqSize, IntPtr.Zero))
                            {
                                string path = Marshal.PtrToStringAuto(detailData + 4);
                                if (path != null && path.IndexOf("mi_" + mi.ToString("D2"), StringComparison.OrdinalIgnoreCase) >= 0 &&
                                    path.IndexOf("2269", StringComparison.OrdinalIgnoreCase) >= 0)
                                {
                                    Console.WriteLine("  Found: " + path);
                                }
                            }
                        }
                        finally { Marshal.FreeHGlobal(detailData); }
                        idx++;
                    }
                }
                finally { SetupDiDestroyDeviceInfoList(hDevInfo2); }
            }
        }

        // 4. Diagnosis summary
        Console.WriteLine("\n=== Diagnosis ===");
        if (paths.Count > 0 && paths[0].IndexOf("&mi_", StringComparison.OrdinalIgnoreCase) < 0)
        {
            Console.WriteLine("PROBLEM: WinUSB is installed on the COMPOSITE PARENT device.");
            Console.WriteLine("This means WinUSB replaced the USB composite driver (usbccgp.sys).");
            Console.WriteLine("WinUsb_Initialize will fail because the device has multiple interfaces.");
            Console.WriteLine();
            Console.WriteLine("FIX: You need to reinstall the composite driver and put WinUSB on");
            Console.WriteLine("the specific DATA interface instead.");
            Console.WriteLine();
            Console.WriteLine("Steps:");
            Console.WriteLine("  1. Open Device Manager");
            Console.WriteLine("  2. Find Procyon-CM, right-click -> Uninstall device");
            Console.WriteLine("  3. CHECK 'Attempt to remove the driver for this device'");
            Console.WriteLine("  4. Click Uninstall");
            Console.WriteLine("  5. Unplug the USB cable, wait 5 seconds, plug it back in");
            Console.WriteLine("  6. Wait for Windows to reinstall the composite driver");
            Console.WriteLine("  7. Open Zadig -> Options -> List All Devices");
            Console.WriteLine("  8. Select the DATA interface (NOT parent, NOT DFU) in dropdown");
            Console.WriteLine("  9. Install WinUSB on that interface only");
            Console.WriteLine(" 10. Run 'procyon-usb.exe diag' again to verify");
        }
        else if (paths.Count == 0)
        {
            Console.WriteLine("No WinUSB paths found for Procyon device.");
            Console.WriteLine("Make sure the device is plugged in and WinUSB driver is installed via Zadig.");
        }
        else
        {
            Console.WriteLine("WinUSB paths look correct (composite child interfaces found).");
            Console.WriteLine("Run 'procyon-usb.exe test' to test connection.");
        }
    }

    static string GetDeviceProperty(IntPtr hDevInfo, ref SP_DEVINFO_DATA devInfo, int property)
    {
        int propType = 0;
        int requiredSize = 0;
        SetupDiGetDeviceRegistryProperty(hDevInfo, ref devInfo, property, ref propType, null, 0, ref requiredSize);
        if (requiredSize == 0) return null;

        byte[] buffer = new byte[requiredSize];
        if (!SetupDiGetDeviceRegistryProperty(hDevInfo, ref devInfo, property, ref propType, buffer, buffer.Length, ref requiredSize))
            return null;

        // REG_SZ = 1, REG_MULTI_SZ = 7
        if (propType == 1 || propType == 7)
        {
            // Decode as Unicode, take first string (for MULTI_SZ, stop at first null)
            string result = Marshal.PtrToStringAuto(Marshal.UnsafeAddrOfPinnedArrayElement(buffer, 0));
            return result;
        }
        return null;
    }

    // === Find Device ===
    static void FindDevice()
    {
        List<string> paths = FindAllDevicePaths();
        if (paths.Count > 0)
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("{\"found\":true,\"paths\":[");
            for (int i = 0; i < paths.Count; i++)
            {
                if (i > 0) sb.Append(",");
                sb.Append("\"").Append(paths[i].Replace("\\", "\\\\")).Append("\"");
            }
            sb.Append("]}");
            Console.WriteLine(sb.ToString());
        }
        else
            WriteJson("{\"found\":false}");
    }

    // === Connect (try all paths) ===
    static void Connect()
    {
        if (winUsbHandle != IntPtr.Zero)
        {
            WriteJson("{\"connected\":true,\"message\":\"Already connected\"}");
            return;
        }

        List<string> devicePaths = FindAllDevicePaths();
        if (devicePaths.Count == 0)
        {
            WriteJson("{\"connected\":false,\"error\":\"Procyon WinUSB device path not found. Make sure WinUSB driver is installed via Zadig.\"}");
            return;
        }

        List<string> errors = new List<string>();
        foreach (string devicePath in devicePaths)
        {
            deviceHandle = CreateFile(devicePath, GENERIC_READ | GENERIC_WRITE,
                FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);

            if (deviceHandle == null || deviceHandle.IsInvalid)
            {
                int err = Marshal.GetLastWin32Error();
                deviceHandle = null;
                errors.Add("CreateFile failed on " + devicePath + " (err=" + err + ")");
                continue;
            }

            if (!WinUsb_Initialize(deviceHandle, out winUsbHandle))
            {
                int err = Marshal.GetLastWin32Error();
                deviceHandle.Dispose();
                deviceHandle = null;
                errors.Add("WinUsb_Initialize failed on " + devicePath + " (err=" + err + ")");
                continue;
            }

            pipeIn = 0x81;
            pipeOut = 0x01;
            for (byte i = 0; i < 16; i++)
            {
                WINUSB_PIPE_INFORMATION pipeInfo;
                if (WinUsb_QueryPipe(winUsbHandle, 0, i, out pipeInfo))
                {
                    if ((pipeInfo.PipeId & 0x80) != 0) pipeIn = pipeInfo.PipeId;
                    else pipeOut = pipeInfo.PipeId;
                }
                else break;
            }

            WriteJson("{\"connected\":true,\"pipeIn\":\"0x" + pipeIn.ToString("x") + "\",\"pipeOut\":\"0x" + pipeOut.ToString("x") + "\",\"path\":\"" + devicePath.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"}");
            return;
        }

        // All paths failed - include hint about composite device issue
        StringBuilder sb = new StringBuilder();
        sb.Append("{\"connected\":false,\"error\":\"All paths failed (WinUsb_Initialize error=6 usually means WinUSB is on composite parent instead of child interface). Run procyon-usb.exe diag for fix instructions.\",\"attempts\":[");
        for (int i = 0; i < errors.Count; i++)
        {
            if (i > 0) sb.Append(",");
            sb.Append("\"").Append(errors[i].Replace("\"", "\\\"")).Append("\"");
        }
        sb.Append("]}");
        Console.WriteLine(sb.ToString());
    }

    static void Disconnect()
    {
        if (winUsbHandle != IntPtr.Zero) { WinUsb_Free(winUsbHandle); winUsbHandle = IntPtr.Zero; }
        if (deviceHandle != null && !deviceHandle.IsInvalid) { deviceHandle.Dispose(); deviceHandle = null; }
        WriteJson("{\"disconnected\":true}");
    }

    static void SendData(string hexData)
    {
        if (winUsbHandle == IntPtr.Zero) { WriteError("Not connected"); return; }
        byte[] data = HexToBytes(hexData);
        if (data.Length < 64) { byte[] padded = new byte[64]; Array.Copy(data, padded, data.Length); data = padded; }
        int transferred;
        if (WinUsb_WritePipe(winUsbHandle, pipeOut, data, data.Length, out transferred, IntPtr.Zero))
            WriteJson("{\"sent\":true,\"bytes\":" + transferred + "}");
        else
            WriteError("WritePipe failed");
    }

    static void ReadData(int length, int timeoutMs)
    {
        if (winUsbHandle == IntPtr.Zero) { WriteError("Not connected"); return; }
        uint timeoutVal = (uint)timeoutMs;
        WinUsb_SetPipePolicy(winUsbHandle, pipeIn, SHORT_TIMEOUT_POLICY, 4, ref timeoutVal);

        byte[] buffer = new byte[length];
        int transferred;
        if (WinUsb_ReadPipe(winUsbHandle, pipeIn, buffer, length, out transferred, IntPtr.Zero))
        {
            string hex = BitConverter.ToString(buffer, 0, transferred).Replace("-", "").ToLower();
            WriteJson("{\"read\":true,\"bytes\":" + transferred + ",\"data\":\"" + hex + "\"}");
        }
        else
        {
            WriteError("ReadPipe failed (timeout or error)");
        }
    }

    static void SendAndRead(string hexData, int timeoutMs)
    {
        if (winUsbHandle == IntPtr.Zero) { WriteError("Not connected"); return; }

        byte[] sendData = HexToBytes(hexData);
        if (sendData.Length < 64) { byte[] padded = new byte[64]; Array.Copy(sendData, padded, sendData.Length); sendData = padded; }
        int sent;
        if (!WinUsb_WritePipe(winUsbHandle, pipeOut, sendData, sendData.Length, out sent, IntPtr.Zero))
        {
            WriteError("WritePipe failed");
            return;
        }

        uint timeoutVal = (uint)timeoutMs;
        WinUsb_SetPipePolicy(winUsbHandle, pipeIn, SHORT_TIMEOUT_POLICY, 4, ref timeoutVal);

        byte[] buffer = new byte[64];
        int read;
        if (WinUsb_ReadPipe(winUsbHandle, pipeIn, buffer, 64, out read, IntPtr.Zero))
        {
            string hex = BitConverter.ToString(buffer, 0, read).Replace("-", "").ToLower();
            WriteJson("{\"sent\":" + sent + ",\"read\":" + read + ",\"data\":\"" + hex + "\"}");
        }
        else
        {
            WriteJson("{\"sent\":" + sent + ",\"readError\":true,\"winError\":" + Marshal.GetLastWin32Error() + "}");
        }
    }

    static void RunTest()
    {
        Console.WriteLine("=== Procyon WinUSB Test ===");

        List<string> allPaths = FindAllDevicePaths();
        Console.WriteLine("0. Found " + allPaths.Count + " WinUSB path(s) for Procyon:");
        foreach (string p in allPaths)
        {
            bool hasMi = p.IndexOf("&mi_", StringComparison.OrdinalIgnoreCase) >= 0;
            Console.WriteLine("   " + p + (hasMi ? " [COMPOSITE CHILD - OK]" : " [NO &mi_ - PARENT DEVICE!]"));
        }

        if (allPaths.Count == 0)
        {
            Console.WriteLine("   No WinUSB paths found! Check Zadig driver installation.");
            return;
        }

        // Check for composite parent problem
        bool allParent = true;
        foreach (string p in allPaths)
        {
            if (p.IndexOf("&mi_", StringComparison.OrdinalIgnoreCase) >= 0)
                allParent = false;
        }
        if (allParent)
        {
            Console.WriteLine("\nWARNING: All paths are COMPOSITE PARENT paths (no &mi_ in path).");
            Console.WriteLine("This means WinUSB replaced the USB composite driver.");
            Console.WriteLine("WinUsb_Initialize will likely fail. Run 'procyon-usb.exe diag' for fix.");
            Console.WriteLine();
        }

        bool connected = false;
        foreach (string path in allPaths)
        {
            Console.Write("1. Trying path: " + path + "\n   CreateFile... ");
            deviceHandle = CreateFile(path, GENERIC_READ | GENERIC_WRITE,
                FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);

            if (deviceHandle == null || deviceHandle.IsInvalid)
            {
                int err = Marshal.GetLastWin32Error();
                deviceHandle = null;
                Console.WriteLine("FAILED (err=" + err + ")");
                continue;
            }
            Console.WriteLine("OK");

            Console.Write("   WinUsb_Initialize... ");
            if (!WinUsb_Initialize(deviceHandle, out winUsbHandle))
            {
                int err = Marshal.GetLastWin32Error();
                Console.WriteLine("FAILED (err=" + err + ")");
                if (err == 6)
                    Console.WriteLine("   -> ERROR_INVALID_HANDLE: WinUSB is on composite parent, not child interface!");
                deviceHandle.Dispose();
                deviceHandle = null;
                continue;
            }
            Console.WriteLine("OK");
            connected = true;
            break;
        }

        if (!connected)
        {
            Console.WriteLine("\nERROR: Could not connect on any path!");
            Console.WriteLine("Run 'procyon-usb.exe diag' for detailed diagnosis and fix instructions.");
            return;
        }

        Console.Write("3. Sending GET_FIRMWARE_VERSION... ");
        byte[] cmd = new byte[64];
        cmd[0] = 0x01;
        int sent;
        if (!WinUsb_WritePipe(winUsbHandle, pipeOut, cmd, 64, out sent, IntPtr.Zero))
        {
            Console.WriteLine("FAILED! WinError=" + Marshal.GetLastWin32Error());
            Disconnect();
            return;
        }
        Console.WriteLine("OK (" + sent + " bytes)");

        Console.Write("4. Reading response... ");
        uint timeout = 3000;
        WinUsb_SetPipePolicy(winUsbHandle, pipeIn, SHORT_TIMEOUT_POLICY, 4, ref timeout);

        byte[] buffer = new byte[64];
        int read;
        if (WinUsb_ReadPipe(winUsbHandle, pipeIn, buffer, 64, out read, IntPtr.Zero))
        {
            Console.WriteLine("OK (" + read + " bytes)");
            Console.WriteLine("   Header: 0x" + buffer[0].ToString("x"));
            Console.WriteLine("   Data: " + BitConverter.ToString(buffer, 0, Math.Min(read, 16)).Replace("-", " "));
            if (buffer[0] == 0xA5)
                Console.WriteLine("   *** VALID PROCYON RESPONSE! ***");
        }
        else
        {
            int err = Marshal.GetLastWin32Error();
            Console.WriteLine("FAILED! WinError=" + err);
        }

        Disconnect();
        Console.WriteLine("\n=== Test Complete ===");
    }

    static byte[] HexToBytes(string hex)
    {
        hex = hex.Replace(" ", "").Replace("0x", "").Replace(",", "");
        if (hex.Length % 2 != 0) hex = "0" + hex;
        byte[] bytes = new byte[hex.Length / 2];
        for (int i = 0; i < bytes.Length; i++)
            bytes[i] = Convert.ToByte(hex.Substring(i * 2, 2), 16);
        return bytes;
    }
}
