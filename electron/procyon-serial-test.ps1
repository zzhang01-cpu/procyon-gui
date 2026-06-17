# Procyon USB Test - Install CDC driver and test via virtual COM port
# The device is CDC class (0x0A) with strings "CDC Config" / "CDC Interface"
# It should work as a virtual serial port with usbser.sys driver

$code = @"
using System;
using System.IO.Ports;
using System.Text;
using System.Threading;

public class ProcyonSerialTest
{
    public static string Test()
    {
        var sb = new StringBuilder();
        sb.AppendLine("=== Procyon CDC Serial Port Test ===");

        // List available COM ports
        sb.AppendLine("\n--- Available COM Ports ---");
        string[] ports = SerialPort.GetPortNames();
        if (ports.Length == 0)
        {
            sb.AppendLine("  No COM ports found!");
            sb.AppendLine("  The CDC driver may not be installed.");
            sb.AppendLine("  Try: pnputil /add-driver usbser.inf /install");
            return sb.ToString();
        }
        foreach (string p in ports)
            sb.AppendLine("  " + p);

        // Try each port
        foreach (string portName in ports)
        {
            sb.AppendLine("\n--- Testing " + portName + " ---");
            try
            {
                using (var port = new SerialPort(portName))
                {
                    port.BaudRate = 115200;
                    port.DataBits = 8;
                    port.StopBits = StopBits.One;
                    port.Parity = Parity.None;
                    port.ReadTimeout = 3000;
                    port.WriteTimeout = 3000;
                    port.DtrEnable = true;
                    port.RtsEnable = true;

                    port.Open();
                    sb.AppendLine("  Opened OK at 115200 baud");
                    Thread.Sleep(500);

                    // Discard any buffered data
                    port.DiscardInBuffer();
                    port.DiscardOutBuffer();

                    // Test 1: Binary command (0x01 = GET_FIRMWARE)
                    sb.AppendLine("\n  --- Binary command 0x01 (GET_FIRMWARE) ---");
                    byte[] cmd1 = new byte[64];
                    for (int i = 0; i < 64; i++) cmd1[i] = 0xFF;
                    cmd1[0] = 0x01;
                    port.Write(cmd1, 0, 64);
                    sb.AppendLine("  Written 64 bytes");

                    Thread.Sleep(500);
                    try
                    {
                        byte[] resp = new byte[256];
                        int bytesRead = port.Read(resp, 0, 256);
                        sb.AppendLine("  Read " + bytesRead + " bytes");
                        if (bytesRead > 0)
                        {
                            sb.Append("  Hex: ");
                            for (int i = 0; i < Math.Min(bytesRead, 48); i++)
                                sb.Append(resp[i].ToString("X2") + " ");
                            sb.AppendLine();
                            sb.Append("  ASCII: ");
                            for (int i = 0; i < Math.Min(bytesRead, 48); i++)
                                sb.Append((resp[i] >= 0x20 && resp[i] < 0x7F) ? (char)resp[i] : '.');
                            sb.AppendLine();
                        }
                    }
                    catch (TimeoutException)
                    {
                        sb.AppendLine("  Read timeout (no response)");
                    }

                    // Test 2: Short binary command
                    sb.AppendLine("\n  --- Short binary command (1 byte: 0x01) ---");
                    port.DiscardInBuffer();
                    port.Write(new byte[] { 0x01 }, 0, 1);
                    Thread.Sleep(500);
                    try
                    {
                        byte[] resp2 = new byte[256];
                        int bytesRead2 = port.Read(resp2, 0, 256);
                        sb.AppendLine("  Read " + bytesRead2 + " bytes");
                        if (bytesRead2 > 0)
                        {
                            sb.Append("  Hex: ");
                            for (int i = 0; i < Math.Min(bytesRead2, 48); i++)
                                sb.Append(resp2[i].ToString("X2") + " ");
                            sb.AppendLine();
                        }
                    }
                    catch (TimeoutException)
                    {
                        sb.AppendLine("  Read timeout");
                    }

                    // Test 3: ASCII text command
                    sb.AppendLine("\n  --- ASCII command 'V' (version?) ---");
                    port.DiscardInBuffer();
                    port.Write("V\r\n");
                    Thread.Sleep(500);
                    try
                    {
                        byte[] resp3 = new byte[256];
                        int bytesRead3 = port.Read(resp3, 0, 256);
                        sb.AppendLine("  Read " + bytesRead3 + " bytes");
                        if (bytesRead3 > 0)
                        {
                            sb.Append("  Hex: ");
                            for (int i = 0; i < Math.Min(bytesRead3, 48); i++)
                                sb.Append(resp3[i].ToString("X2") + " ");
                            sb.AppendLine();
                            sb.Append("  ASCII: ");
                            for (int i = 0; i < Math.Min(bytesRead3, 48); i++)
                                sb.Append((resp3[i] >= 0x20 && resp3[i] < 0x7F) ? (char)resp3[i] : '.');
                            sb.AppendLine();
                        }
                    }
                    catch (TimeoutException)
                    {
                        sb.AppendLine("  Read timeout");
                    }

                    // Test 4: Procyon-style 0x55 0xAA header
                    sb.AppendLine("\n  --- Header 0x55 0xAA 0x01 0x00 ---");
                    port.DiscardInBuffer();
                    byte[] cmd4 = new byte[64];
                    for (int i = 0; i < 64; i++) cmd4[i] = 0xFF;
                    cmd4[0] = 0x55; cmd4[1] = 0xAA; cmd4[2] = 0x01; cmd4[3] = 0x00;
                    port.Write(cmd4, 0, 64);
                    Thread.Sleep(1000);
                    try
                    {
                        byte[] resp4 = new byte[512];
                        int bytesRead4 = port.Read(resp4, 0, 512);
                        sb.AppendLine("  Read " + bytesRead4 + " bytes");
                        if (bytesRead4 > 0)
                        {
                            sb.Append("  Hex: ");
                            for (int i = 0; i < Math.Min(bytesRead4, 64); i++)
                                sb.Append(resp4[i].ToString("X2") + " ");
                            sb.AppendLine();
                            sb.Append("  ASCII: ");
                            for (int i = 0; i < Math.Min(bytesRead4, 64); i++)
                                sb.Append((resp4[i] >= 0x20 && resp4[i] < 0x7F) ? (char)resp4[i] : '.');
                            sb.AppendLine();
                        }
                    }
                    catch (TimeoutException)
                    {
                        sb.AppendLine("  Read timeout");
                    }

                    // Test 5: Just read whatever is buffered
                    sb.AppendLine("\n  --- Read any pending data ---");
                    Thread.Sleep(500);
                    try
                    {
                        if (port.BytesToRead > 0)
                        {
                            byte[] resp5 = new byte[port.BytesToRead];
                            port.Read(resp5, 0, resp5.Length);
                            sb.AppendLine("  Read " + resp5.Length + " bytes");
                            sb.Append("  Hex: ");
                            for (int i = 0; i < Math.Min(resp5.Length, 64); i++)
                                sb.Append(resp5[i].ToString("X2") + " ");
                            sb.AppendLine();
                        }
                        else
                        {
                            sb.AppendLine("  No pending data");
                        }
                    }
                    catch (Exception ex5)
                    {
                        sb.AppendLine("  Error: " + ex5.Message);
                    }

                    port.Close();
                }
            }
            catch (Exception ex)
            {
                sb.AppendLine("  Error: " + ex.Message);
            }
        }

        sb.AppendLine("\n=== Done ===");
        return sb.ToString();
    }
}
"@

Write-Host "Compiling..."
Add-Type -TypeDefinition $code -Language CSharp
Write-Host "Running..."
[ProcyonSerialTest]::Test()
