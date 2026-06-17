# Create a standalone .NET console app that references the original LibUsbDotNet.dll
# This should work because dotnet can handle .NET Standard 2.0 libraries

$procyonDir = "C:\Users\zzhang01\Desktop\Work\Software\Procyon\proc..tion_0000000000000000_0004.0006_74513a0239a65c66"
$libUsbDll = Join-Path $procyonDir "LibUsbDotNet.dll"
$procyonDll = Join-Path $procyonDir "Procyon.dll"

# Check if dotnet is available
$dotnetExe = Get-Command dotnet -ErrorAction SilentlyContinue
if (!$dotnetExe) {
    Write-Host "dotnet SDK not found. Cannot create .NET project."
    Write-Host "Install from: https://dotnet.microsoft.com/download/dotnet/8.0"
    exit 1
}

Write-Host "dotnet version: $(dotnet --version)"

$projectDir = "C:\Projects\procyon-gui\electron\ProcyonUsbTest"
if (Test-Path $projectDir) { Remove-Item $projectDir -Recurse -Force }

# Create project
New-Item -ItemType Directory -Path $projectDir -Force | Out-Null
Push-Location $projectDir

dotnet new console --framework net8.0

# Copy LibUsbDotNet.dll locally
Copy-Item $libUsbDll "LibUsbDotNet.dll" -Force

# Add reference to LibUsbDotNet.dll
dotnet add reference ./LibUsbDotNet.dll 2>$null

# Also try to load and inspect Procyon.dll
Copy-Item $procyonDll "Procyon.dll" -Force

# Write the test program
$programCs = @"
using System;
using System.Reflection;
using System.Linq;

class Program
{
    static void Main(string[] args)
    {
        Console.WriteLine("=== Procyon USB Test via LibUsbDotNet ===");

        // Step 1: Inspect LibUsbDotNet types
        Console.WriteLine("\n--- LibUsbDotNet Types ---");
        try
        {
            var asm = Assembly.LoadFrom("LibUsbDotNet.dll");
            Console.WriteLine("Loaded: " + asm.FullName);
            
            foreach (var t in asm.GetTypes())
            {
                Console.WriteLine("  " + t.FullName);
                // Show key methods
                foreach (var m in t.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
                {
                    var parms = string.Join(", ", m.GetParameters().Select(p => p.ParameterType.Name + " " + p.Name));
                    Console.WriteLine("    " + m.ReturnType.Name + " " + m.Name + "(" + parms + ")");
                }
            }
        }
        catch (ReflectionTypeLoadException ex)
        {
            Console.WriteLine("Partial load:");
            foreach (var t in ex.Types.Where(t => t != null))
            {
                Console.WriteLine("  " + t.FullName);
                try
                {
                    foreach (var m in t.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
                    {
                        var parms = string.Join(", ", m.GetParameters().Select(p => p.ParameterType.Name + " " + p.Name));
                        Console.WriteLine("    " + m.ReturnType.Name + " " + m.Name + "(" + parms + ")");
                    }
                }
                catch { }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("Error: " + ex.Message);
        }

        // Step 2: Inspect Procyon.dll
        Console.WriteLine("\n--- Procyon.dll Types (Device-related) ---");
        try
        {
            var pAsm = Assembly.LoadFrom("Procyon.dll");
            Console.WriteLine("Loaded: " + pAsm.FullName);
            
            foreach (var t in pAsm.GetTypes())
            {
                if (t.Name.Contains("UsbDev") || t.Name.Contains("DeviceCommon") || t.Name.Contains("DeviceFunction"))
                {
                    Console.WriteLine("\n  === " + t.FullName + " ===");
                    Console.WriteLine("  BaseType: " + (t.BaseType?.FullName ?? "none"));
                    
                    Console.WriteLine("  --- Methods ---");
                    foreach (var m in t.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
                    {
                        var parms = string.Join(", ", m.GetParameters().Select(p => p.ParameterType.Name + " " + p.Name));
                        Console.WriteLine("    " + (m.IsStatic ? "static " : "") + m.ReturnType.Name + " " + m.Name + "(" + parms + ")");
                    }
                    
                    Console.WriteLine("  --- Fields ---");
                    foreach (var f in t.GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
                    {
                        string val = "";
                        try { if (f.IsLiteral) val = " = " + f.GetRawConstantValue(); } catch { }
                        Console.WriteLine("    " + (f.IsStatic ? "static " : "") + f.FieldType.Name + " " + f.Name + val);
                    }
                    
                    Console.WriteLine("  --- Properties ---");
                    foreach (var p in t.GetProperties(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly))
                    {
                        Console.WriteLine("    " + p.PropertyType.Name + " " + p.Name);
                    }
                }
            }
            
            // Also list all enums
            Console.WriteLine("\n--- All Enums ---");
            foreach (var t in pAsm.GetTypes().Where(t => t != null && t.IsEnum))
            {
                Console.WriteLine("  " + t.FullName + ":");
                foreach (var v in Enum.GetValues(t))
                {
                    Console.WriteLine("    " + v + " = " + Convert.ToInt32(v));
                }
            }
        }
        catch (ReflectionTypeLoadException ex)
        {
            Console.WriteLine("Partial load of Procyon.dll:");
            foreach (var t in ex.Types.Where(t => t != null))
            {
                if (t.Name.Contains("UsbDev") || t.Name.Contains("DeviceCommon") || t.Name.Contains("DeviceFunction") || t.IsEnum)
                {
                    Console.WriteLine("\n  === " + t.FullName + " ===");
                    try
                    {
                        foreach (var m in t.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
                        {
                            var parms = string.Join(", ", m.GetParameters().Select(p => p.ParameterType.Name + " " + p.Name));
                            Console.WriteLine("    " + m.ReturnType.Name + " " + m.Name + "(" + parms + ")");
                        }
                        foreach (var f in t.GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
                        {
                            string val = "";
                            try { if (f.IsLiteral) val = " = " + f.GetRawConstantValue(); } catch { }
                            Console.WriteLine("    " + f.FieldType.Name + " " + f.Name + val);
                        }
                    }
                    catch { }
                }
            }
            // Still list loaded enums
            Console.WriteLine("\n--- Loaded Enums ---");
            foreach (var t in ex.Types.Where(t => t != null && t.IsEnum))
            {
                Console.WriteLine("  " + t.FullName + ":");
                try
                {
                    foreach (var v in Enum.GetValues(t))
                        Console.WriteLine("    " + v + " = " + Convert.ToInt32(v));
                }
                catch { }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("Error loading Procyon.dll: " + ex.Message);
        }

        // Step 3: Try actual USB communication via LibUsbDotNet
        Console.WriteLine("\n--- USB Communication Test ---");
        try
        {
            var asm = Assembly.LoadFrom("LibUsbDotNet.dll");
            
            // Find UsbDevice type
            var usbDeviceType = asm.GetType("LibUsbDotNet.UsbDevice")
                             ?? asm.GetType("LibUsbDotNet.LibUsb.UsbDevice")
                             ?? asm.GetType("LibUsbDotNet.WinUsb.UsbDevice");
            
            if (usbDeviceType != null)
            {
                Console.WriteLine("Found UsbDevice type: " + usbDeviceType.FullName);
                
                // Try to find UsbDeviceFinder
                var finderType = asm.GetType("LibUsbDotNet.UsbDeviceFinder")
                              ?? asm.GetType("LibUsbDotNet.DeviceNotify.UsbDeviceFinder");
                
                if (finderType != null)
                {
                    Console.WriteLine("Found UsbDeviceFinder: " + finderType.FullName);
                    var finder = Activator.CreateInstance(finderType, 0x2269, 0xBEEF);
                    Console.WriteLine("Created finder");
                    
                    // Call OpenUsbDevice
                    var openMethod = usbDeviceType.GetMethod("OpenUsbDevice", new[] { finderType });
                    if (openMethod != null)
                    {
                        Console.WriteLine("Calling OpenUsbDevice...");
                        var device = openMethod.Invoke(null, new object[] { finder });
                        if (device != null)
                        {
                            Console.WriteLine("Device opened! Type: " + device.GetType().FullName);
                            
                            // Try to open endpoints
                            var openWriterMethod = device.GetType().GetMethod("OpenEndpointWriter");
                            var openReaderMethod = device.GetType().GetMethod("OpenEndpointReader");
                            
                            if (openWriterMethod != null)
                            {
                                // Find WriteEndpointID enum
                                var writeEpType = asm.GetType("LibUsbDotNet.WriteEndpointID")
                                               ?? asm.GetTypes().FirstOrDefault(t => t.Name == "WriteEndpointID");
                                if (writeEpType != null)
                                {
                                    var ep1Out = Enum.Parse(writeEpType, "Ep1");
                                    var writer = openWriterMethod.Invoke(device, new object[] { ep1Out });
                                    Console.WriteLine("Writer opened: " + (writer != null));
                                }
                            }
                            
                            if (openReaderMethod != null)
                            {
                                var readEpType = asm.GetType("LibUsbDotNet.ReadEndpointID")
                                              ?? asm.GetTypes().FirstOrDefault(t => t.Name == "ReadEndpointID");
                                if (readEpType != null)
                                {
                                    var ep1In = Enum.Parse(readEpType, "Ep1");
                                    var reader = openReaderMethod.Invoke(device, new object[] { ep1In });
                                    Console.WriteLine("Reader opened: " + (reader != null));
                                }
                            }
                        }
                        else
                        {
                            Console.WriteLine("OpenUsbDevice returned null - device not found or already in use");
                        }
                    }
                    else
                    {
                        Console.WriteLine("OpenUsbDevice method not found");
                        // List all static methods
                        foreach (var m in usbDeviceType.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly))
                        {
                            Console.WriteLine("  static " + m.ReturnType.Name + " " + m.Name);
                        }
                    }
                }
                else
                {
                    Console.WriteLine("UsbDeviceFinder not found");
                }
            }
            else
            {
                Console.WriteLine("UsbDevice type not found in LibUsbDotNet");
                // List all types to find the right ones
                foreach (var t in asm.GetTypes())
                {
                    if (t.Name.Contains("Usb") || t.Name.Contains("Device") || t.Name.Contains("Endpoint"))
                        Console.WriteLine("  " + t.FullName);
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("USB test error: " + ex.Message);
            if (ex.InnerException != null)
                Console.WriteLine("  Inner: " + ex.InnerException.Message);
        }

        Console.WriteLine("\n=== Done ===");
    }
}
"@

Set-Content -Path "Program.cs" -Value $programCs -Encoding UTF8

# Build and run
Write-Host "`nBuilding..."
dotnet build -c Release 2>&1 | Select-Object -Last 10

Write-Host "`nRunning..."
dotnet run -c Release 2>&1

Pop-Location
