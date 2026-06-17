# Procyon USB Protocol Discovery via libusb0.dll
# Try various command formats to find what the device responds to
# Key facts: EP1 OUT write OK (64B), EP1 IN read always timeout

$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class ProcyonProto
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
    static extern int usb_bulk_write(IntPtr dev, int ep, byte[] bytes, int size, int timeout);
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int usb_bulk_read(IntPtr dev, int ep, byte[] bytes, int size, int timeout);
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int usb_control_msg(IntPtr dev, int requesttype, int request, int value, int index, byte[] bytes, int size, int timeout);
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int usb_reset(IntPtr dev);
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern IntPtr usb_strerror();

    const int BUS_NEXT_OFF = 0;
    const int BUS_DEVICES_OFF = 528;
    const int DEV_NEXT_OFF = 0;
    const int DEV_DESC_OFF = 536;
    const int DESC_IDVENDOR_OFF = 8;
    const int DESC_IDPRODUCT_OFF = 10;

    static ushort ReadU16(IntPtr ptr, int offset) { return (ushort)Marshal.ReadInt16(ptr, offset); }

    static IntPtr FindDevice(ushort vid, ushort pid)
    {
        IntPtr bus = usb_get_busses();
        while (bus != IntPtr.Zero)
        {
            IntPtr dev = Marshal.ReadIntPtr(bus, BUS_DEVICES_OFF);
            while (dev != IntPtr.Zero)
            {
                if (ReadU16(dev, DEV_DESC_OFF + DESC_IDVENDOR_OFF) == vid && ReadU16(dev, DEV_DESC_OFF + DESC_IDPRODUCT_OFF) == pid)
                    return dev;
                dev = Marshal.ReadIntPtr(dev, DEV_NEXT_OFF);
            }
            bus = Marshal.ReadIntPtr(bus, BUS_NEXT_OFF);
        }
        return IntPtr.Zero;
    }

    static string Hex(byte[] buf, int len)
    {
        var sb = new StringBuilder();
        for (int i = 0; i < Math.Min(len, 32); i++)
            sb.Append(buf[i].ToString("X2") + " ");
        return sb.ToString();
    }

    static string Ascii(byte[] buf, int len)
    {
        var sb = new StringBuilder();
        for (int i = 0; i < Math.Min(len, 32); i++)
            sb.Append((buf[i] >= 0x20 && buf[i] < 0x7F) ? (char)buf[i] : '.');
        return sb.ToString();
    }

    static int TryWriteRead(IntPtr handle, byte[] cmd, int timeout, StringBuilder sb, string label)
    {
        int ret = usb_bulk_write(handle, 0x01, cmd, cmd.Length, 3000);
        sb.AppendLine("  Write " + label + " (" + cmd.Length + "B): " + (ret < 0 ? "FAIL " + ret : "OK " + ret + "B"));
        if (ret < 0) return ret;

        byte[] resp = new byte[512];
        ret = usb_bulk_read(handle, 0x81, resp, 512, timeout);
        if (ret < 0)
        {
            sb.AppendLine("  Read: TIMEOUT (" + ret + ")");
        }
        else
        {
            sb.AppendLine("  Read: OK " + ret + "B");
            sb.AppendLine("  Hex: " + Hex(resp, ret));
            sb.AppendLine("  Asc: " + Ascii(resp, ret));
        }
        return ret;
    }

    public static string Test()
    {
        var sb = new StringBuilder();
        sb.AppendLine("=== Procyon Protocol Discovery ===");
        usb_init(); usb_find_busses(); usb_find_devices();

        IntPtr dev = FindDevice(0x2269, 0xBEEF);
        if (dev == IntPtr.Zero) { sb.AppendLine("Device NOT FOUND!"); return sb.ToString(); }

        IntPtr handle = usb_open(dev);
        if (handle == IntPtr.Zero) { sb.AppendLine("usb_open FAILED"); return sb.ToString(); }
        sb.AppendLine("usb_open OK");

        try
        {
            usb_set_configuration(handle, 1);
            int claimRet = usb_claim_interface(handle, 1);
            if (claimRet < 0)
            {
                claimRet = usb_claim_interface(handle, 0);
                sb.AppendLine("Claimed IF=0 (ret=" + claimRet + ")");
            }
            else
            {
                sb.AppendLine("Claimed IF=1");
            }

            // ======= CDC SETUP =======
            sb.AppendLine("\n=== CDC Setup ===");
            byte[] lineCoding = new byte[7];
            // 115200 = 0x0001C200
            lineCoding[0] = 0x00; lineCoding[1] = 0xC2; lineCoding[2] = 0x01; lineCoding[3] = 0x00;
            lineCoding[4] = 0x00; // 1 stop bit
            lineCoding[5] = 0x00; // no parity
            lineCoding[6] = 0x08; // 8 data bits

            // SET_LINE_CODING: 0x21, bRequest=0x20, wValue=0, wIndex=1
            int ctrl = usb_control_msg(handle, 0x21, 0x20, 0, 1, lineCoding, 7, 3000);
            sb.AppendLine("SET_LINE_CODING: " + ctrl);

            // SET_CONTROL_LINE_STATE: 0x21, bRequest=0x22, wValue=3 (DTR+RTS), wIndex=1
            ctrl = usb_control_msg(handle, 0x21, 0x22, 3, 1, null, 0, 3000);
            sb.AppendLine("SET_CONTROL_LINE_STATE(DTR+RTS): " + ctrl);

            System.Threading.Thread.Sleep(1000);

            // ======= TEST VARIOUS COMMAND FORMATS =======
            sb.AppendLine("\n=== Command Format Tests ===");

            // Format 1: Single byte command
            sb.AppendLine("\n--- Format 1: Single byte 0x01 ---");
            TryWriteRead(handle, new byte[] { 0x01 }, 3000, sb, "0x01");

            // Format 2: 0xA5 0x5A header (common sync pattern)
            sb.AppendLine("\n--- Format 2: 0xA5 0x5A 0x01 ---");
            byte[] fmt2 = new byte[64];
            for (int i = 0; i < 64; i++) fmt2[i] = 0xFF;
            fmt2[0] = 0xA5; fmt2[1] = 0x5A; fmt2[2] = 0x01;
            TryWriteRead(handle, fmt2, 3000, sb, "0xA5 0x5A 0x01");

            // Format 3: 0x5A 0xA5 header (reversed sync)
            sb.AppendLine("\n--- Format 3: 0x5A 0xA5 0x01 ---");
            byte[] fmt3 = new byte[64];
            for (int i = 0; i < 64; i++) fmt3[i] = 0xFF;
            fmt3[0] = 0x5A; fmt3[1] = 0xA5; fmt3[2] = 0x01;
            TryWriteRead(handle, fmt3, 3000, sb, "0x5A 0xA5 0x01");

            // Format 4: 0x55 0xAA header
            sb.AppendLine("\n--- Format 4: 0x55 0xAA 0x01 ---");
            byte[] fmt4 = new byte[64];
            for (int i = 0; i < 64; i++) fmt4[i] = 0xFF;
            fmt4[0] = 0x55; fmt4[1] = 0xAA; fmt4[2] = 0x01;
            TryWriteRead(handle, fmt4, 3000, sb, "0x55 0xAA 0x01");

            // Format 5: 0xAA 0x55 header (reversed)
            sb.AppendLine("\n--- Format 5: 0xAA 0x55 0x01 ---");
            byte[] fmt5 = new byte[64];
            for (int i = 0; i < 64; i++) fmt5[i] = 0xFF;
            fmt5[0] = 0xAA; fmt5[1] = 0x55; fmt5[2] = 0x01;
            TryWriteRead(handle, fmt5, 3000, sb, "0xAA 0x55 0x01");

            // Format 6: 0x00 0x01 (length + cmd)
            sb.AppendLine("\n--- Format 6: 0x00 0x01 ---");
            byte[] fmt6 = new byte[64];
            for (int i = 0; i < 64; i++) fmt6[i] = 0xFF;
            fmt6[0] = 0x00; fmt6[1] = 0x01;
            TryWriteRead(handle, fmt6, 3000, sb, "0x00 0x01");

            // Format 7: 0x02 0x00 0x01 0x00 (STX + length + cmd + ETX)
            sb.AppendLine("\n--- Format 7: STX 0x02 cmd=0x01 ETX 0x03 ---");
            byte[] fmt7 = new byte[64];
            for (int i = 0; i < 64; i++) fmt7[i] = 0xFF;
            fmt7[0] = 0x02; fmt7[1] = 0x01; fmt7[2] = 0x03;
            TryWriteRead(handle, fmt7, 3000, sb, "STX+0x01+ETX");

            // Format 8: Empty write (just 0xFF padding)
            sb.AppendLine("\n--- Format 8: All 0xFF ---");
            byte[] fmt8 = new byte[64];
            for (int i = 0; i < 64; i++) fmt8[i] = 0xFF;
            TryWriteRead(handle, fmt8, 3000, sb, "all 0xFF");

            // Format 9: All zeros
            sb.AppendLine("\n--- Format 9: All 0x00 ---");
            byte[] fmt9 = new byte[64];
            TryWriteRead(handle, fmt9, 3000, sb, "all 0x00");

            // Format 10: ASCII "IDN?\n" (SCPI-style)
            sb.AppendLine("\n--- Format 10: ASCII 'IDN?\\n' ---");
            byte[] fmt10 = System.Text.Encoding.ASCII.GetBytes("IDN?\n");
            TryWriteRead(handle, fmt10, 3000, sb, "IDN?\\n");

            // Format 11: ASCII "?V\r" or "?V\n"
            sb.AppendLine("\n--- Format 11: ASCII '?V\\r' ---");
            byte[] fmt11 = System.Text.Encoding.ASCII.GetBytes("?V\r");
            TryWriteRead(handle, fmt11, 3000, sb, "?V\\r");

            // Format 12: 0x01 with zero padding (not 0xFF)
            sb.AppendLine("\n--- Format 12: 0x01 + zero padding ---");
            byte[] fmt12 = new byte[64];
            fmt12[0] = 0x01;
            TryWriteRead(handle, fmt12, 3000, sb, "0x01+zeros");

            // Format 13: Just try reading without writing first
            sb.AppendLine("\n--- Format 13: Read without write ---");
            byte[] resp13 = new byte[512];
            int ret13 = usb_bulk_read(handle, 0x81, resp13, 512, 2000);
            sb.AppendLine("  Read: " + (ret13 < 0 ? "FAIL " + ret13 : "OK " + ret13 + "B " + Hex(resp13, ret13)));

            // ======= SEND_ENCAPSULATED_COMMAND via control =======
            sb.AppendLine("\n=== SEND_ENCAPSULATED_COMMAND via Control Transfer ===");

            // SEND_ENCAPSULATED_COMMAND: bmRequestType=0x21, bRequest=0x00
            byte[] encapCmd = new byte[64];
            for (int i = 0; i < 64; i++) encapCmd[i] = 0xFF;
            encapCmd[0] = 0x01;

            ctrl = usb_control_msg(handle, 0x21, 0x00, 0, 1, encapCmd, 64, 3000);
            sb.AppendLine("SEND_ENCAP(0x01): " + ctrl);

            // Now try bulk read
            byte[] encapResp = new byte[512];
            int encapRet = usb_bulk_read(handle, 0x81, encapResp, 512, 3000);
            sb.AppendLine("  BulkRead after ENCAP: " + (encapRet < 0 ? "FAIL " + encapRet : "OK " + encapRet + "B " + Hex(encapResp, encapRet)));

            // GET_ENCAPSULATED_RESPONSE: bmRequestType=0xA1, bRequest=0x01
            byte[] encapRespCtrl = new byte[256];
            ctrl = usb_control_msg(handle, 0xA1, 0x01, 0, 1, encapRespCtrl, 256, 3000);
            sb.AppendLine("  GET_ENCAP_RESP: " + ctrl + "B");
            if (ctrl > 0)
            {
                sb.AppendLine("  Hex: " + Hex(encapRespCtrl, ctrl));
                sb.AppendLine("  Asc: " + Ascii(encapRespCtrl, ctrl));
            }

            // ======= Try different baud rates =======
            sb.AppendLine("\n=== Try 9600 baud ===");
            lineCoding[0] = 0x80; lineCoding[1] = 0x25; lineCoding[2] = 0x00; lineCoding[3] = 0x00; // 9600
            ctrl = usb_control_msg(handle, 0x21, 0x20, 0, 1, lineCoding, 7, 3000);
            sb.AppendLine("SET_LINE_CODING(9600): " + ctrl);
            System.Threading.Thread.Sleep(200);

            byte[] cmd9600 = new byte[64];
            for (int i = 0; i < 64; i++) cmd9600[i] = 0xFF;
            cmd9600[0] = 0x01;
            TryWriteRead(handle, cmd9600, 3000, sb, "0x01 @9600");

            // Reset to 115200
            lineCoding[0] = 0x00; lineCoding[1] = 0xC2; lineCoding[2] = 0x01; lineCoding[3] = 0x00;
            usb_control_msg(handle, 0x21, 0x20, 0, 1, lineCoding, 7, 3000);

            usb_release_interface(handle, 1);
        }
        finally
        {
            usb_close(handle);
            sb.AppendLine("\nusb_close OK");
        }

        sb.AppendLine("=== Done ===");
        return sb.ToString();
    }
}
"@

Write-Host "Compiling..."
Add-Type -TypeDefinition $code -Language CSharp
Write-Host "Running..."
[ProcyonProto]::Test()
