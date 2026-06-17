# Procyon USB Test - CDC ACM Encapsulated Command Protocol
# The device might use SEND_ENCAPSULATED_COMMAND / GET_ENCAPSULATED_RESPONSE
# instead of bulk transfers for command/response!

$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class ProcyonUsb
{
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int usb_init();
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int usb_find_busses();
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int usb_find_devices();
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern IntPtr usb_get_busses();
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern IntPtr usb_open(IntPtr dev);
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int usb_close(IntPtr dev);
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int usb_set_configuration(IntPtr dev, int configuration);
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int usb_claim_interface(IntPtr dev, int iface);
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int usb_release_interface(IntPtr dev, int iface);
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int usb_control_msg(IntPtr dev, int requesttype, int request, int value, int index, byte[] bytes, int size, int timeout);
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int usb_bulk_write(IntPtr dev, int ep, byte[] bytes, int size, int timeout);
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int usb_bulk_read(IntPtr dev, int ep, byte[] bytes, int size, int timeout);
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern IntPtr usb_strerror();

    const int BUS_NEXT_OFF = 0;
    const int BUS_DEVICES_OFF = 528;
    const int DEV_NEXT_OFF = 0;
    const int DEV_DESC_OFF = 536;
    const int DESC_IDVENDOR_OFF = 8;
    const int DESC_IDPRODUCT_OFF = 10;

    static ushort ReadU16(IntPtr ptr, int offset) { return (ushort)Marshal.ReadInt16(ptr, offset); }

    static string GetErr()
    {
        IntPtr p = usb_strerror();
        return p != IntPtr.Zero ? Marshal.PtrToStringAnsi(p) : "unknown";
    }

    static IntPtr FindDevice(ushort vid, ushort pid)
    {
        IntPtr bus = usb_get_busses();
        while (bus != IntPtr.Zero)
        {
            IntPtr dev = Marshal.ReadIntPtr(bus, BUS_DEVICES_OFF);
            while (dev != IntPtr.Zero)
            {
                ushort devVid = ReadU16(dev, DEV_DESC_OFF + DESC_IDVENDOR_OFF);
                ushort devPid = ReadU16(dev, DEV_DESC_OFF + DESC_IDPRODUCT_OFF);
                if (devVid == vid && devPid == pid)
                    return dev;
                dev = Marshal.ReadIntPtr(dev, DEV_NEXT_OFF);
            }
            bus = Marshal.ReadIntPtr(bus, BUS_NEXT_OFF);
        }
        return IntPtr.Zero;
    }

    static string BytesToHex(byte[] buf, int len)
    {
        var sb = new StringBuilder();
        int show = Math.Min(len, 64);
        for (int i = 0; i < show; i++)
            sb.Append(buf[i].ToString("X2") + " ");
        if (len > 64) sb.Append("...");
        return sb.ToString();
    }

    static string ParseString(byte[] buf, int start, int maxLen)
    {
        var sb = new StringBuilder();
        for (int i = start; i < start + maxLen && i < buf.Length; i++)
        {
            if (buf[i] == 0x00 || buf[i] == 0xFF) break;
            sb.Append((char)buf[i]);
        }
        return sb.ToString().Trim();
    }

    // CDC ACM request types
    const int USB_TYPE_CLASS = 0x20;
    const int USB_RECIP_INTERFACE = 0x01;
    const int USB_DIR_OUT = 0x00;
    const int USB_DIR_IN = 0x80;

    // SEND_ENCAPSULATED_COMMAND: class OUT to interface, bRequest=0x00
    const int SEND_ENCAP = USB_DIR_OUT | USB_TYPE_CLASS | USB_RECIP_INTERFACE;  // 0x21
    const int SEND_ENCAP_REQ = 0x00;

    // GET_ENCAPSULATED_RESPONSE: class IN from interface, bRequest=0x01
    const int GET_ENCAP = USB_DIR_IN | USB_TYPE_CLASS | USB_RECIP_INTERFACE;   // 0xA1
    const int GET_ENCAP_REQ = 0x01;

    // SET_LINE_CODING: class OUT, bRequest=0x20
    const int SET_LINE_CODING_REQ = 0x20;
    // GET_LINE_CODING: class IN, bRequest=0x21
    const int GET_LINE_CODING_REQ = 0x21;
    // SET_CONTROL_LINE_STATE: class OUT, bRequest=0x22
    const int SET_CTRL_LINE_REQ = 0x22;

    static int SendEncapCmd(IntPtr handle, byte[] data, int timeout)
    {
        return usb_control_msg(handle, SEND_ENCAP, SEND_ENCAP_REQ, 0, 1, data, data.Length, timeout);
    }

    static int GetEncapResp(IntPtr handle, byte[] buf, int timeout)
    {
        return usb_control_msg(handle, GET_ENCAP, GET_ENCAP_REQ, 0, 1, buf, buf.Length, timeout);
    }

    public static string Test()
    {
        var sb = new StringBuilder();
        sb.AppendLine("=== Procyon CDC Encapsulated Command Test ===");

        usb_init();
        usb_find_busses();
        usb_find_devices();

        IntPtr procyonDev = FindDevice(0x2269, 0xBEEF);
        if (procyonDev == IntPtr.Zero) { sb.AppendLine("Device NOT FOUND!"); return sb.ToString(); }

        IntPtr handle = usb_open(procyonDev);
        if (handle == IntPtr.Zero) { sb.AppendLine("usb_open FAILED"); return sb.ToString(); }
        sb.AppendLine("usb_open OK");

        try
        {
            int ret = usb_set_configuration(handle, 1);
            sb.AppendLine("SetConfig(1): " + (ret < 0 ? "err=" + ret : "OK"));
            ret = usb_claim_interface(handle, 1);
            sb.AppendLine("Claim(1): " + (ret < 0 ? "err=" + ret + " " + GetErr() : "OK"));

            // CDC setup first
            sb.AppendLine("");
            sb.AppendLine("--- CDC Setup ---");
            byte[] lineCoding = new byte[7]; // 115200, 8N1
            lineCoding[0] = 0x00; lineCoding[1] = 0xC2; lineCoding[2] = 0x01; lineCoding[3] = 0x00; // 115200
            lineCoding[4] = 0x00; // 1 stop bit
            lineCoding[5] = 0x00; // no parity
            lineCoding[6] = 0x08; // 8 data bits
            ret = usb_control_msg(handle, SEND_ENCAP, SET_LINE_CODING_REQ, 0, 1, lineCoding, 7, 3000);
            sb.AppendLine("  SET_LINE_CODING: " + ret);

            byte[] ctrlLine = new byte[0];
            ret = usb_control_msg(handle, SEND_ENCAP, SET_CTRL_LINE_REQ, 3, 1, ctrlLine, 0, 3000);
            sb.AppendLine("  SET_CTRL_LINE(DTR+RTS): " + ret);

            // Test 1: SEND_ENCAP + GET_ENCAP with different command codes
            sb.AppendLine("");
            sb.AppendLine("=== CDC Encapsulated Command Protocol Test ===");

            byte[] cmdCodes = { 0x01, 0x02, 0x03, 0x04, 0x10, 0x11, 0x15, 0x16, 0x00, 0x55, 0xAA };
            string[] cmdNames = {
                "GET_FIRMWARE(0x01)", "GET_BATTERY(0x02)", "GET_TEMPERATURE(0x03)",
                "GET_TOOL_SN(0x04)", "GET_UNIQUE_ID(0x10)", "GET_MEMORY_PART(0x11)",
                "RUN_SELF_TEST(0x15)", "INIT_LOGGER(0x16)", "NULL(0x00)",
                "SYNC(0x55)", "SYNC(0xAA)"
            };

            for (int ci = 0; ci < cmdCodes.Length; ci++)
            {
                sb.AppendLine("");
                sb.AppendLine("--- " + cmdNames[ci] + " ---");

                // Build 64-byte command packet
                byte[] cmd = new byte[64];
                for (int i = 0; i < 64; i++) cmd[i] = 0xFF;
                cmd[0] = cmdCodes[ci];

                // Send via SEND_ENCAPSULATED_COMMAND
                ret = SendEncapCmd(handle, cmd, 3000);
                sb.AppendLine("  SEND_ENCAP: " + (ret < 0 ? "FAIL " + ret + " " + GetErr() : "OK " + ret + "B"));

                // Read response via GET_ENCAPSULATED_RESPONSE
                byte[] resp = new byte[256];
                ret = GetEncapResp(handle, resp, 3000);
                if (ret < 0)
                {
                    sb.AppendLine("  GET_ENCAP: FAIL " + ret + " " + GetErr());
                }
                else
                {
                    sb.AppendLine("  GET_ENCAP: OK " + ret + "B");
                    sb.AppendLine("  Hex: " + BytesToHex(resp, ret));
                    if (ret > 0)
                    {
                        // Check for response header
                        if (resp[0] == 0xA5)
                            sb.AppendLine("  >>> RESPONSE HEADER 0xA5 detected!");
                        else if (resp[0] == cmdCodes[ci])
                            sb.AppendLine("  >>> Echo of command byte");
                        // Try to parse as string
                        string str = ParseString(resp, 0, Math.Min(ret, 64));
                        if (str.Length > 0 && str.Length != ret) // not all bytes were FF/00
                            sb.AppendLine("  >>> String: " + str);
                    }
                }

                // Also try bulk read after control command
                byte[] bulkResp = new byte[256];
                ret = usb_bulk_read(handle, 0x81, bulkResp, 256, 500);
                if (ret > 0)
                {
                    sb.AppendLine("  BULK READ after ENCAP: OK " + ret + "B");
                    sb.AppendLine("  Hex: " + BytesToHex(bulkResp, ret));
                }
            }

            // Test 2: Try different data sizes for SEND_ENCAP
            sb.AppendLine("");
            sb.AppendLine("=== SEND_ENCAP Size Test (cmd=0x01) ===");
            int[] sizes = { 1, 2, 4, 8, 16, 32, 64, 128 };
            foreach (int sz in sizes)
            {
                byte[] cmd = new byte[sz];
                for (int i = 0; i < sz; i++) cmd[i] = 0xFF;
                cmd[0] = 0x01; // GET_FIRMWARE_VERSION
                ret = SendEncapCmd(handle, cmd, 3000);
                string sendResult = ret < 0 ? "FAIL " + ret : "OK " + ret + "B";

                byte[] resp = new byte[256];
                ret = GetEncapResp(handle, resp, 3000);
                string getResult = ret < 0 ? "FAIL " + ret : ret + "B";

                // Check if response differs from default echo
                bool isEcho = ret > 0 && resp[0] == 0x01;
                bool hasA5 = false;
                for (int i = 0; i < ret; i++) { if (resp[i] == 0xA5) { hasA5 = true; break; } }

                sb.AppendLine("  Send " + sz + "B: " + sendResult + " | Get: " + getResult +
                    (isEcho ? " [ECHO]" : "") + (hasA5 ? " [HAS_A5]" : ""));
            }

            // Test 3: Try without 0xFF padding
            sb.AppendLine("");
            sb.AppendLine("=== Minimal Command Test ===");
            {
                // Just 1 byte command
                byte[] cmd1 = new byte[] { 0x01 };
                ret = SendEncapCmd(handle, cmd1, 3000);
                sb.AppendLine("  SEND(1B, 0x01): " + (ret < 0 ? "FAIL" : "OK " + ret + "B"));
                byte[] resp1 = new byte[256];
                ret = GetEncapResp(handle, resp1, 3000);
                sb.AppendLine("  GET: " + (ret < 0 ? "FAIL " + ret : ret + "B " + BytesToHex(resp1, ret)));

                // 2 bytes: cmd + 0x00
                byte[] cmd2 = new byte[] { 0x01, 0x00 };
                ret = SendEncapCmd(handle, cmd2, 3000);
                sb.AppendLine("  SEND(2B, 0x01 0x00): " + (ret < 0 ? "FAIL" : "OK " + ret + "B"));
                byte[] resp2 = new byte[256];
                ret = GetEncapResp(handle, resp2, 3000);
                sb.AppendLine("  GET: " + (ret < 0 ? "FAIL " + ret : ret + "B " + BytesToHex(resp2, ret)));

                // wValue approach - send cmd via wValue, not data
                byte[] emptyData = new byte[0];
                ret = usb_control_msg(handle, SEND_ENCAP, SEND_ENCAP_REQ, 0x0001, 1, emptyData, 0, 3000);
                sb.AppendLine("  SEND(wValue=0x0001, no data): " + (ret < 0 ? "FAIL" : "OK " + ret));
                byte[] resp3 = new byte[256];
                ret = GetEncapResp(handle, resp3, 3000);
                sb.AppendLine("  GET: " + (ret < 0 ? "FAIL " + ret : ret + "B " + BytesToHex(resp3, ret)));
            }

            // Test 4: Try SEND_ENCAP + wait + BULK READ
            sb.AppendLine("");
            sb.AppendLine("=== SEND_ENCAP then BULK READ ===");
            {
                byte[] cmd = new byte[64];
                for (int i = 0; i < 64; i++) cmd[i] = 0xFF;
                cmd[0] = 0x01;
                ret = SendEncapCmd(handle, cmd, 3000);
                sb.AppendLine("  SEND_ENCAP(0x01): " + (ret < 0 ? "FAIL" : "OK"));

                // Skip GET_ENCAP, go directly to bulk read
                byte[] bulkResp = new byte[256];
                ret = usb_bulk_read(handle, 0x81, bulkResp, 256, 3000);
                sb.AppendLine("  BULK_READ: " + (ret < 0 ? "FAIL " + ret + " " + GetErr() : "OK " + ret + "B " + BytesToHex(bulkResp, ret)));
            }

            // Test 5: Different wIndex values
            sb.AppendLine("");
            sb.AppendLine("=== SEND_ENCAP with different wIndex ===");
            for (int wIdx = 0; wIdx <= 4; wIdx++)
            {
                byte[] cmd = new byte[64];
                for (int i = 0; i < 64; i++) cmd[i] = 0xFF;
                cmd[0] = 0x01;
                ret = usb_control_msg(handle, SEND_ENCAP, SEND_ENCAP_REQ, 0, wIdx, cmd, 64, 3000);
                string sendStr = ret < 0 ? "FAIL" : "OK " + ret;
                byte[] resp = new byte[256];
                ret = usb_control_msg(handle, GET_ENCAP, GET_ENCAP_REQ, 0, wIdx, resp, 256, 3000);
                string getStr = ret < 0 ? "FAIL " + ret : ret + "B";
                sb.AppendLine("  wIndex=" + wIdx + ": Send=" + sendStr + " Get=" + getStr);
                if (ret > 0) sb.AppendLine("    Hex: " + BytesToHex(resp, Math.Min(ret, 16)));
            }

            // Test 6: SEND_ENCAP with wValue = cmd code
            sb.AppendLine("");
            sb.AppendLine("=== SEND_ENCAP with wValue=cmd, empty data ===");
            {
                byte[] cmds = { 0x01, 0x02, 0x03, 0x04, 0x10, 0x11 };
                foreach (byte c in cmds)
                {
                    byte[] empty = new byte[0];
                    ret = usb_control_msg(handle, SEND_ENCAP, SEND_ENCAP_REQ, c, 1, empty, 0, 3000);
                    string sendStr = ret < 0 ? "FAIL" : "OK";
                    byte[] resp = new byte[256];
                    ret = usb_control_msg(handle, GET_ENCAP, GET_ENCAP_REQ, 0, 1, resp, 256, 3000);
                    string getStr = ret < 0 ? "FAIL" : ret + "B " + BytesToHex(resp, Math.Min(ret, 16));
                    sb.AppendLine("  cmd=0x" + c.ToString("X2") + " in wValue: Send=" + sendStr + " Get=" + getStr);
                }
            }

            usb_release_interface(handle, 1);
        }
        finally
        {
            usb_close(handle);
            sb.AppendLine("\nusb_close OK\n=== Test Complete ===");
        }
        return sb.ToString();
    }
}
"@

Write-Host "Compiling..."
Add-Type -TypeDefinition $code -Language CSharp
Write-Host "Running CDC encapsulated command test..."
[ProcyonUsb]::Test()
