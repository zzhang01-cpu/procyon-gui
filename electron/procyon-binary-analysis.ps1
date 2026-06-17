# Deep binary analysis of Procyon.dll to extract USB protocol information
# Focus on ProcyonNet.Device.UsbDev class and related types

$procyonDir = "C:\Users\zzhang01\Desktop\Work\Software\Procyon\proc..tion_0000000000000000_0004.0006_74513a0239a65c66"
$dll = Join-Path $procyonDir "Procyon.dll"

if (!(Test-Path $dll)) {
    Write-Host "Procyon.dll not found at $dll"
    exit
}

$bytes = [System.IO.File]::ReadAllBytes($dll)
$text16 = [System.Text.Encoding]::Unicode.GetString($bytes)
$text8 = [System.Text.Encoding]::ASCII.GetString($bytes)

Write-Host "=== Procyon.dll Deep Protocol Analysis ==="
Write-Host "Size: $($bytes.Length) bytes"

# 1. Find ALL strings in ProcyonNet.Device namespace
Write-Host "`n=== ProcyonNet.Device.* strings ==="
$matches16 = [regex]::Matches($text16, '[\x20-\x7E]{4,}')
$matches16 | ForEach-Object { $_.Value } | Where-Object { $_ -match 'ProcyonNet\.Device|UsbDev' } | Select-Object -Unique | ForEach-Object { Write-Host "  $_" }

# 2. Find ALL methods in UsbDev class (search for async state machine patterns)
Write-Host "`n=== UsbDev method names ==="
$matches16 | ForEach-Object { $_.Value } | Where-Object { $_ -match '^<.+>d__\d+' -or $_ -match 'UsbDev' } | Select-Object -Unique | Sort-Object | ForEach-Object { Write-Host "  $_" }

# 3. Search for command-related strings (Write/Read/Send/Receive/Command)
Write-Host "`n=== Command-related strings ==="
$matches16 | ForEach-Object { $_.Value } | Where-Object { $_ -match 'Write|Read|Send|Receive|Transfer|Command|Packet|Buffer|Payload|Opcode|Cmd|Request|Response' -and $_.Length -lt 80 -and $_ -notmatch 'DevExpress|Bunifu|System\.|Microsoft\.|Windows\.' } | Select-Object -Unique | Sort-Object | ForEach-Object { Write-Host "  $_" }

# 4. Search for byte array initializations (common in USB protocols)
Write-Host "`n=== Potential command constants ==="
$matches8 | ForEach-Object { $_.Value } | Where-Object { $_ -match '0x[0-9A-Fa-f]{2}' -and $_.Length -lt 60 } | Select-Object -Unique | Where-Object { $_ -match 'command|cmd|opcode|request|code|byte|packet' } | ForEach-Object { Write-Host "  $_" }

# 5. Search for enum-like patterns (command codes)
Write-Host "`n=== Enum-like patterns ==="
$matches16 | ForEach-Object { $_.Value } | Where-Object { $_ -match 'Command|CmdCode|Opcode|RequestId|PacketType|MessageType|FunctionCode|Operation' -and $_.Length -lt 60 } | Select-Object -Unique | ForEach-Object { Write-Host "  $_" }

# 6. Search for LibUsbDotNet specific strings
Write-Host "`n=== LibUsbDotNet usage ==="
$matches16 | ForEach-Object { $_.Value } | Where-Object { $_ -match 'UsbDevice|EndpointWriter|EndpointReader|UsbDeviceFinder|ReadEndpoint|WriteEndpoint|LibUsb|WinUsb|UsbRegistry|OpenEndpoint|ClaimInterface|SetConfiguration' } | Select-Object -Unique | ForEach-Object { Write-Host "  $_" }

# 7. Search for specific device operations
Write-Host "`n=== Device operations ==="
$matches16 | ForEach-Object { $_.Value } | Where-Object { $_ -match 'GetFirmware|GetBattery|GetSerial|GetConfig|GetTime|GetMemory|GetAccel|GetGyro|GetPressure|SetTime|SetConfig|SetSelfTest|EraseMemory|EraseInternal|DownloadData|ReadMemory|WriteMemory|InitDevice|ConnectDevice|DisconnectDevice|GetDeviceInfo|GetStatus|GetVersion|SetTool|SetRun|SetCustomer|GetTemperature|GetDepth|SetDepth|SetParameter|GetParameter' -and $_.Length -lt 80 } | Select-Object -Unique | Sort-Object | ForEach-Object { Write-Host "  $_" }

# 8. Search for USB endpoint references
Write-Host "`n=== Endpoint/pipe references ==="
$matches16 | ForEach-Object { $_.Value } | Where-Object { $_ -match 'Ep1|EP1|ep1|Endpoint1|endpoint1|Pipe1|pipe1|0x01|0x81|BulkOut|BulkIn|WritePipe|ReadPipe|OutEndpoint|InEndpoint' -and $_.Length -lt 80 } | Select-Object -Unique | ForEach-Object { Write-Host "  $_" }

# 9. Search for timeout/delay values
Write-Host "`n=== Timeout/delay values ==="
$matches16 | ForEach-Object { $_.Value } | Where-Object { $_ -match 'timeout|Timeout|TIMEOUT|delay|Delay|DELAY|interval|Interval' -and $_.Length -lt 60 } | Select-Object -Unique | ForEach-Object { Write-Host "  $_" }

# 10. Search for the actual UsbDev class structure
Write-Host "`n=== UsbDev class structure ==="
$matches16 | ForEach-Object { $_.Value } | Where-Object { $_ -match 'UsbDev' -and $_.Length -lt 120 } | Select-Object -Unique | Sort-Object | ForEach-Object { Write-Host "  $_" }

# 11. Look for error codes and status messages
Write-Host "`n=== USB error/status messages ==="
$matches16 | ForEach-Object { $_.Value } | Where-Object { $_ -match 'USB|usb|device not|no device|connection fail|open fail|write fail|read fail|transfer fail|claim fail|interface fail|unsupported' -and $_.Length -lt 80 -and $_ -notmatch 'DevExpress|Bunifu|System\.|Microsoft\.|Windows\.' } | Select-Object -Unique | ForEach-Object { Write-Host "  $_" }

# 12. Search for packet structure strings
Write-Host "`n=== Packet structure ==="
$matches16 | ForEach-Object { $_.Value } | Where-Object { $_ -match 'header|Header|HEADER|payload|Payload|PAYLOAD|checksum|Checksum|CHECKSUM|crc|CRC|length|Length|LENGTH|offset|Offset|OFFSET|size|Size' -and $_.Length -lt 60 -and $_ -match 'Procyon|Usb|Device|packet|Packet|command|Command' } | Select-Object -Unique | ForEach-Object { Write-Host "  $_" }

# 13. Look for all async methods in UsbDev
Write-Host "`n=== Async methods (d__ patterns) ==="
$matches16 | ForEach-Object { $_.Value } | Where-Object { $_ -match '<.+>d__\d+' -and $_.Length -lt 80 } | Select-Object -Unique | Sort-Object | ForEach-Object { Write-Host "  $_" }

# 14. Search for "ProcyonNet" namespace classes
Write-Host "`n=== ProcyonNet namespace classes ==="
$matches16 | ForEach-Object { $_.Value } | Where-Object { $_ -match 'ProcyonNet\.' -and $_.Length -lt 100 } | Select-Object -Unique | Sort-Object | ForEach-Object { Write-Host "  $_" }

Write-Host "`n=== Done ==="
