# Test USB communication using the ORIGINAL LibUsbDotNet.dll from Procyon software
# Loading from the Procyon install directory so dependencies resolve

$dllDir = "C:\Users\zzhang01\Desktop\Work\Software\Procyon\proc..tion_0000000000000000_0004.0006_74513a0239a65c66"
$dllPath = Join-Path $dllDir "LibUsbDotNet.dll"

Write-Host "=== Using ORIGINAL LibUsbDotNet.dll ===" -ForegroundColor Cyan
Write-Host "DLL: $dllPath"
Write-Host "Exists: $(Test-Path $dllPath)"

$code = @"
using System;
using System.Reflection;
using System.Text;

public class OrigLibUsbTest
{
    public static string Test(string dllPath)
    {
        var sb = new StringBuilder();
        sb.AppendLine("=== Test with Original LibUsbDotNet.dll ===");

        try
        {
            // Load from file so dependencies resolve from same directory
            Assembly asm = Assembly.LoadFrom(dllPath);
            sb.AppendLine("Loaded: " + asm.FullName);

            // List all types
            sb.AppendLine("\n--- Types in LibUsbDotNet ---");
            Type[] types = asm.GetTypes();
            foreach (Type t in types)
            {
                string name = t.FullName;
                if (name == null) continue;
                sb.AppendLine("  " + name);
            }

            // Find key types
            Type usbDeviceType = null;
            Type usbDeviceFinderType = null;
            Type endpointReaderType = null;
            Type endpointWriterType = null;
            Type endpointType = null;
            Type readPolicyType = null;
            Type usbErrorCodeType = null;

            foreach (Type t in types)
            {
                string n = t.FullName;
                if (n == null) continue;
                if (n.Contains("UsbDevice") && !n.Contains("Finder") && !n.Contains("Info") && usbDeviceType == null)
                    usbDeviceType = t;
                if (n.Contains("UsbDeviceFinder"))
                    usbDeviceFinderType = t;
                if (n.Contains("EndpointReader") || n.Contains("UsbEndpointReader"))
                    endpointReaderType = t;
                if (n.Contains("EndpointWriter") || n.Contains("UsbEndpointWriter"))
                    endpointWriterType = t;
                if (n.Contains("UsbEndpoint") && !n.Contains("Reader") && !n.Contains("Writer") && endpointType == null)
                    endpointType = t;
                if (n.Contains("ReadPolicy"))
                    readPolicyType = t;
                if (n.Contains("UsbErrorCode") || n.Contains("ErrorCode"))
                    usbErrorCodeType = t;
            }

            sb.AppendLine("\n--- Key Types Found ---");
            if (usbDeviceType != null) sb.AppendLine("  UsbDevice: " + usbDeviceType.FullName);
            if (usbDeviceFinderType != null) sb.AppendLine("  UsbDeviceFinder: " + usbDeviceFinderType.FullName);
            if (endpointReaderType != null) sb.AppendLine("  EndpointReader: " + endpointReaderType.FullName);
            if (endpointWriterType != null) sb.AppendLine("  EndpointWriter: " + endpointWriterType.FullName);
            if (endpointType != null) sb.AppendLine("  Endpoint: " + endpointType.FullName);
            if (readPolicyType != null) sb.AppendLine("  ReadPolicy: " + readPolicyType.FullName);

            // List UsbDevice methods
            if (usbDeviceType != null)
            {
                sb.AppendLine("\n--- UsbDevice Methods ---");
                foreach (var m in usbDeviceType.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
                    sb.AppendLine("  " + m.Name + m.ToString());
                sb.AppendLine("\n--- UsbDevice Static Methods ---");
                foreach (var m in usbDeviceType.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly))
                    sb.AppendLine("  " + m.Name + m.ToString());
                sb.AppendLine("\n--- UsbDevice Properties ---");
                foreach (var p in usbDeviceType.GetProperties())
                    sb.AppendLine("  " + p.Name + " : " + p.PropertyType.Name);
            }

            // List EndpointType enum values
            if (endpointType != null && endpointType.IsEnum)
            {
                sb.AppendLine("\n--- Endpoint Enum Values ---");
                foreach (var v in Enum.GetValues(endpointType))
                    sb.AppendLine("  " + v + " = " + Convert.ToInt32(v));
            }

            // List ReadPolicy enum values
            if (readPolicyType != null && readPolicyType.IsEnum)
            {
                sb.AppendLine("\n--- ReadPolicy Enum Values ---");
                foreach (var v in Enum.GetValues(readPolicyType))
                    sb.AppendLine("  " + v + " = " + Convert.ToInt32(v));
            }

            // Now try to use it!
            sb.AppendLine("\n=== Attempting USB Communication ===");

            // Create UsbDeviceFinder(0x2269, 0xBEEF)
            if (usbDeviceFinderType != null)
            {
                object finder = Activator.CreateInstance(usbDeviceFinderType, new object[] { (int)0x2269, (int)0xBEEF });
                sb.AppendLine("Created UsbDeviceFinder(0x2269, 0xBEEF)");

                // Find the device - call UsbDevice.OpenDevice or similar
                // Try static method: UsbDevice.OpenUsbDevice(finder)
                if (usbDeviceType != null)
                {
                    MethodInfo openMethod = usbDeviceType.GetMethod("OpenUsbDevice", new Type[] { usbDeviceFinderType });
                    if (openMethod == null)
                    {
                        // Try other method names
                        foreach (var m in usbDeviceType.GetMethods(BindingFlags.Public | BindingFlags.Static))
                        {
                            if (m.Name.Contains("Open") || m.Name.Contains("Find"))
                            {
                                sb.AppendLine("  Found static method: " + m.Name + m.ToString());
                            }
                        }
                    }

                    if (openMethod != null)
                    {
                        sb.AppendLine("Calling OpenUsbDevice...");
                        object usbDevice = openMethod.Invoke(null, new object[] { finder });

                        if (usbDevice == null)
                        {
                            sb.AppendLine("  Device NOT FOUND (null returned)");
                        }
                        else
                        {
                            sb.AppendLine("  Device FOUND: " + usbDevice.GetType().FullName);

                            // Get properties
                            PropertyInfo isConnectedProp = usbDeviceType.GetProperty("IsConnected");
                            if (isConnectedProp != null)
                            {
                                bool connected = (bool)isConnectedProp.GetValue(usbDevice);
                                sb.AppendLine("  IsConnected: " + connected);
                            }

                            PropertyInfo infoProp = usbDeviceType.GetProperty("Info");
                            if (infoProp != null)
                            {
                                object info = infoProp.GetValue(usbDevice);
                                if (info != null)
                                    sb.AppendLine("  Info: " + info.ToString());
                            }

                            // Try OpenEndpointWriter
                            if (endpointWriterType != null && endpointType != null)
                            {
                                // Ep1 = Write
                                object ep1 = Enum.ToObject(endpointType, 1);
                                MethodInfo openWriter = usbDeviceType.GetMethod("OpenEndpointWriter");
                                if (openWriter != null)
                                {
                                    sb.AppendLine("\n  Opening EndpointWriter for EP1...");
                                    object writer = openWriter.Invoke(usbDevice, new object[] { ep1 });
                                    if (writer != null)
                                    {
                                        sb.AppendLine("  Writer opened: " + writer.GetType().FullName);

                                        // Write a command
                                        MethodInfo writeMethod = endpointWriterType.GetMethod("Write", new Type[] { typeof(byte[]), typeof(int), typeof(int), typeof(int).MakeByRefType() });
                                        if (writeMethod != null)
                                        {
                                            byte[] cmd = new byte[64];
                                            for (int i = 0; i < 64; i++) cmd[i] = 0xFF;
                                            cmd[0] = 0x01; // GET_FIRMWARE

                                            object[] writeArgs = new object[] { cmd, 0, 64, 0 };
                                            object writeResult = writeMethod.Invoke(writer, writeArgs);
                                            sb.AppendLine("  Write result: " + writeResult);
                                            sb.AppendLine("  Bytes written: " + writeArgs[3]);
                                        }
                                        else
                                        {
                                            // List all Write methods
                                            foreach (var m in endpointWriterType.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
                                                sb.AppendLine("  Writer method: " + m.Name + m.ToString());
                                        }
                                    }
                                }
                            }

                            // Try OpenEndpointReader
                            if (endpointReaderType != null && endpointType != null)
                            {
                                // EP1 IN = 0x81
                                object ep81 = Enum.ToObject(endpointType, 0x81);
                                MethodInfo openReader = usbDeviceType.GetMethod("OpenEndpointReader");
                                if (openReader != null)
                                {
                                    sb.AppendLine("\n  Opening EndpointReader for EP81...");

                                    // OpenEndpointReader might need different params
                                    foreach (var m in usbDeviceType.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
                                    {
                                        if (m.Name == "OpenEndpointReader")
                                            sb.AppendLine("  Method signature: " + m.ToString());
                                    }

                                    try
                                    {
                                        object reader = openReader.Invoke(usbDevice, new object[] { ep81 });
                                        if (reader != null)
                                        {
                                            sb.AppendLine("  Reader opened: " + reader.GetType().FullName);

                                            // Read
                                            MethodInfo readMethod = null;
                                            foreach (var m in endpointReaderType.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
                                            {
                                                if (m.Name == "Read")
                                                    sb.AppendLine("  Read method: " + m.ToString());
                                            }

                                            byte[] readBuf = new byte[512];
                                            // Try Read(byte[], offset, count)
                                            readMethod = endpointReaderType.GetMethod("Read", new Type[] { typeof(byte[]), typeof(int), typeof(int) });
                                            if (readMethod != null)
                                            {
                                                object readResult = readMethod.Invoke(reader, new object[] { readBuf, 0, 512 });
                                                sb.AppendLine("  Read result: " + readResult);
                                                if (readResult != null)
                                                {
                                                    int bytesRead = 0;
                                                    if (readResult is int)
                                                        bytesRead = (int)readResult;
                                                    else
                                                        bytesRead = Convert.ToInt32(readResult);
                                                    sb.AppendLine("  Bytes read: " + bytesRead);
                                                    if (bytesRead > 0)
                                                    {
                                                        sb.Append("  Data: ");
                                                        for (int i = 0; i < Math.Min(bytesRead, 48); i++)
                                                            sb.Append(readBuf[i].ToString("X2") + " ");
                                                        sb.AppendLine();
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    catch (Exception ex2)
                                    {
                                        sb.AppendLine("  OpenEndpointReader error: " + ex2.Message);
                                        if (ex2.InnerException != null)
                                            sb.AppendLine("  Inner: " + ex2.InnerException.Message);
                                    }
                                }
                            }

                            // Close
                            MethodInfo closeMethod = usbDeviceType.GetMethod("Close");
                            if (closeMethod != null)
                            {
                                closeMethod.Invoke(usbDevice, null);
                                sb.AppendLine("\n  Device closed");
                            }
                        }
                    }
                    else
                    {
                        sb.AppendLine("  OpenUsbDevice method not found!");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            sb.AppendLine("ERROR: " + ex.Message);
            if (ex.InnerException != null)
                sb.AppendLine("Inner: " + ex.InnerException.Message);
            if (ex is ReflectionTypeLoadException)
            {
                sb.AppendLine("LoaderExceptions:");
                foreach (Exception le in ((ReflectionTypeLoadException)ex).LoaderExceptions)
                    sb.AppendLine("  " + le.Message);
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
[OrigLibUsbTest]::Test($dllPath)
