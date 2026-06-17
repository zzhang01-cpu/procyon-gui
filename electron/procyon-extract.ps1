# Extract USB protocol info from original Procyon software
$procyonDir = "C:\Users\zzhang01\Desktop\Work\Software\Procyon\proc..tion_0000000000000000_0004.0006_74513a0239a65c66"

# 1. Extract strings from all key DLLs
foreach ($file in @("Procyon.exe", "Database.dll", "LogConverter.dll")) {
    $path = Join-Path $procyonDir $file
    if (Test-Path $path) {
        Write-Host "`n========== $file (UTF-16) ==========" -ForegroundColor Cyan
        $bytes = [System.IO.File]::ReadAllBytes($path)
        $text16 = [System.Text.Encoding]::Unicode.GetString($bytes)
        $matches16 = [regex]::Matches($text16, '[\x20-\x7E]{6,}')
        $filtered = $matches16 | ForEach-Object { $_.Value } | Where-Object { 
            $_ -match 'usb|USB|bulk|Bulk|EP|LibUsb|firmware|battery|temperature|ToolSN|command|packet|SEND|RECV|endpoint|claim|serial|connect|Write|Read|Device|Config|Interface|Open|Close|0x2269|Procyon|protocol|byte|buffer|transfer|pipe'
        } | Select-Object -Unique
        $filtered | ForEach-Object { Write-Host "  $_" }
    }
}

# 2. Try ildasm on Database.dll
Write-Host "`n========== ildasm Database.dll ==========" -ForegroundColor Cyan
$ildasm = "C:\WINDOWS\Microsoft.NET\Framework64\v4.0.30319\ildasm.exe"
$dbDll = Join-Path $procyonDir "Database.dll"
if ((Test-Path $ildasm) -and (Test-Path $dbDll)) {
    $output = & $ildasm $dbDll /text /nobar 2>&1
    $output | Select-String -Pattern "Usb|usb|Write|Read|bulk|Send|Receive|Command|Packet|Connect|Device|Firmware|Battery|Endpoint|Claim|Open|Transfer|Pipe" | Select-Object -First 100 | ForEach-Object { Write-Host "  $_" }
}

# 3. Try ildasm on Procyon.exe
Write-Host "`n========== ildasm Procyon.exe ==========" -ForegroundColor Cyan
$procyonExe = Join-Path $procyonDir "Procyon.exe"
if ((Test-Path $ildasm) -and (Test-Path $procyonExe)) {
    $output = & $ildasm $procyonExe /text /nobar 2>&1
    $output | Select-String -Pattern "Usb|usb|Write|Read|bulk|Send|Receive|Command|Packet|Connect|Device|Firmware|Battery|Endpoint|Claim|Open|Transfer|Pipe" | Select-Object -First 100 | ForEach-Object { Write-Host "  $_" }
}

# 4. Also check LibUsbDotNet.dll types
Write-Host "`n========== LibUsbDotNet.dll Reflection ==========" -ForegroundColor Cyan
$dllPath = Join-Path $procyonDir "LibUsbDotNet.dll"
if (Test-Path $dllPath) {
    try {
        $asm = [System.Reflection.Assembly]::LoadFrom($dllPath)
        Write-Host "Loaded OK"
        $asm.GetTypes() | ForEach-Object { 
            $t = $_
            $methods = $t.GetMethods([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly)
            if ($methods.Count -gt 0) {
                Write-Host "`n  Type: $($t.FullName)"
                $methods | ForEach-Object { Write-Host "    $($_.Name)$($_.ToString())" }
            }
        } | Select-Object -First 200
    } catch {
        Write-Host "Reflection load failed: $_"
        # Try loading as bytes instead
        $bytes = [System.IO.File]::ReadAllBytes($dllPath)
        try {
            $asm = [System.Reflection.Assembly]::Load($bytes)
            Write-Host "Loaded from bytes OK"
            $asm.GetTypes() | ForEach-Object { Write-Host "  $($_.FullName)" } | Select-Object -First 100
        } catch {
            Write-Host "Byte load also failed: $_"
        }
    }
}

Write-Host "`n========== Done =========="
