// Procyon USB Communication via WinUSB (bypasses libusb)
// Compile: %WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe /out:procyon-usb.exe procyon-usb.cs
using System;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

class ProcyonUsb
{
    // === P/Invoke Declarations ===
    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern IntPtr SetupDiGetClassDevs(ref Guid ClassGuid, IntPtr Enumerator, IntPtr hwndParent, int Flags);

    [DllImport("setupapi.dll", SetLastError = true)]
    static extern bool SetupDiEnumDeviceInterfaces(IntPtr DeviceInfoSet, IntPtr DeviceInfoData, ref Guid InterfaceClassGuid, int MemberIndex, ref SP_DEVICE_INTERFACE_DATA DeviceInterfaceData);

    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr DeviceInfoSet, ref SP_DEVICE_INTERFACE_DATA DeviceInterfaceData, IntPtr DeviceInterfaceDetailData, int DeviceInterfaceDetailDataSize, ref int RequiredSize, IntPtr DeviceInfoData);

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
    const uint GENERIC_READ = 0x80000000;
    const uint GENERIC_WRITE = 0x40000000;
    const int FILE_SHARE_READ = 0x01;
    const int FILE_SHARE_WRITE = 0x02;
    const int OPEN_EXISTING = 3;
    const uint SHORT_TIMEOUT_POLICY = 0x03; // SHORT_TIMEOUT

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

    static string FindDevicePath()
    {
        IntPtr hDevInfo = SetupDiGetClassDevs(ref winusbGuid, IntPtr.Zero, IntPtr.Zero,
            DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
        if (hDevInfo == (IntPtr)(-1)) return null;

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
                        string path = Marshal.PtrToStringAuto(detailData + IntPtr.Size);
                        if (path != null && path.IndexOf("2269", StringComparison.OrdinalIgnoreCase) >= 0 &&
                            path.IndexOf("beef", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            return path;
                        }
                    }
                }
                finally { Marshal.FreeHGlobal(detailData); }
                index++;
            }
        }
        finally { SetupDiDestroyDeviceInfoList(hDevInfo); }
        return null;
    }

    static void FindDevice()
    {
        string path = FindDevicePath();
        if (path != null)
            WriteJson("{\"found\":true,\"path\":\"" + path.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"}");
        else
            WriteJson("{\"found\":false}");
    }

    static void Connect()
    {
        if (winUsbHandle != IntPtr.Zero)
        {
            WriteJson("{\"connected\":true,\"message\":\"Already connected\"}");
            return;
        }

        string devicePath = FindDevicePath();
        if (devicePath == null)
        {
            WriteJson("{\"connected\":false,\"error\":\"Procyon WinUSB device path not found. Make sure WinUSB driver is installed via Zadig.\"}");
            return;
        }

        // CreateFile
        deviceHandle = CreateFile(devicePath, GENERIC_READ | GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);

        if (deviceHandle == null || deviceHandle.IsInvalid)
        {
            int err = Marshal.GetLastWin32Error();
            deviceHandle = null;
            WriteJson("{\"connected\":false,\"error\":\"CreateFile failed\",\"winError\":" + err + "}");
            return;
        }

        // WinUsb_Initialize
        if (!WinUsb_Initialize(deviceHandle, out winUsbHandle))
        {
            int err = Marshal.GetLastWin32Error();
            deviceHandle.Dispose();
            deviceHandle = null;
            WriteJson("{\"connected\":false,\"error\":\"WinUsb_Initialize failed\",\"winError\":" + err + "}");
            return;
        }

        // Query pipes
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

        WriteJson("{\"connected\":true,\"pipeIn\":\"0x" + pipeIn.ToString("x") + "\",\"pipeOut\":\"0x" + pipeOut.ToString("x") + "\"}");
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
        // Pad to 64 bytes
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
        // Set short timeout
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

        // Send
        byte[] sendData = HexToBytes(hexData);
        if (sendData.Length < 64) { byte[] padded = new byte[64]; Array.Copy(sendData, padded, sendData.Length); sendData = padded; }
        int sent;
        if (!WinUsb_WritePipe(winUsbHandle, pipeOut, sendData, sendData.Length, out sent, IntPtr.Zero))
        {
            WriteError("WritePipe failed");
            return;
        }

        // Set timeout and read
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

        // Step 1: Find device
        Console.Write("1. Finding device... ");
        string path = FindDevicePath();
        if (path == null) { Console.WriteLine("NOT FOUND!"); return; }
        Console.WriteLine("Found!");
        Console.WriteLine("   Path: " + path);

        // Step 2: Connect
        Console.Write("2. Connecting... ");
        Connect();
        if (winUsbHandle == IntPtr.Zero) return;

        // Step 3: Send GET_FIRMWARE_VERSION
        Console.Write("3. Sending GET_FIRMWARE_VERSION... ");
        byte[] cmd = new byte[64];
        cmd[0] = 0x01; // Command byte
        int sent;
        if (!WinUsb_WritePipe(winUsbHandle, pipeOut, cmd, 64, out sent, IntPtr.Zero))
        {
            Console.WriteLine("FAILED! WinError=" + Marshal.GetLastWin32Error());
            Disconnect();
            return;
        }
        Console.WriteLine("OK (" + sent + " bytes)");

        // Step 4: Read response
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

        // Step 5: Disconnect
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
