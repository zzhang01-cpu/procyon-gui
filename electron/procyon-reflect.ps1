# Extract IL metadata from Procyon.dll using .NET reflection
# Try to resolve dependencies by loading from the original directory
# Also try to extract method bodies via raw binary analysis

$procyonDir = "C:\Users\zzhang01\Desktop\Work\Software\Procyon\proc..tion_0000000000000000_0004.0006_74513a0239a65c66"
$dll = Join-Path $procyonDir "Procyon.dll"

if (!(Test-Path $dll)) {
    Write-Host "Procyon.dll not found!"
    exit
}

# Method 1: Try loading with AssemblyResolve to find dependencies
Write-Host "=== Method 1: Reflection with dependency resolution ==="

[System.Reflection.Assembly]::LoadWithPartialName("System.Runtime") | Out-Null

$handler = [System.ResolveEventHandler]{
    param($sender, $args)
    $name = $args.Name
    # Try to find the dependency in the Procyon directory
    $shortName = $name.Split(',')[0]
    $depPath = Join-Path $procyonDir "$shortName.dll"
    if (Test-Path $depPath) {
        Write-Host "  Resolved: $shortName from Procyon dir"
        return [System.Reflection.Assembly]::LoadFrom($depPath)
    }
    # Try .NET Framework system assemblies
    $sysPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\$shortName.dll"
    if (Test-Path $sysPath) {
        Write-Host "  Resolved: $shortName from Framework"
        return [System.Reflection.Assembly]::LoadFrom($sysPath)
    }
    Write-Host "  UNRESOLVED: $name"
    return $null
}

[System.AppDomain]::CurrentDomain.add_AssemblyResolve($handler)

try {
    $asm = [System.Reflection.Assembly]::LoadFrom($dll)
    Write-Host "Loaded: $($asm.FullName)"
    
    $types = $asm.GetTypes()
    Write-Host "Types loaded: $($types.Length)"
    
    # Find UsbDev class
    foreach ($t in $types) {
        if ($t.Name -like '*UsbDev*' -or $t.FullName -like '*Device.Usb*') {
            Write-Host "`n=== Found: $($t.FullName) ==="
            Write-Host "  BaseType: $($t.BaseType.FullName)"
            
            # List all methods
            Write-Host "`n  --- Methods ---"
            foreach ($m in $t.GetMethods([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
                $params = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name) $($_.Name)" }) -join ', '
                Write-Host "  $($_.ReturnType.Name) $($m.Name)($params)"
            }
            
            # List all fields
            Write-Host "`n  --- Fields ---"
            foreach ($f in $t.GetFields([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
                Write-Host "  $($f.FieldType.Name) $($f.Name) $(if($f.IsStatic){'[static]'}else{''}) $(if($f.IsLiteral){'[const]=' + $f.GetRawConstantValue()})else{'')}"
            }
            
            # List all properties
            Write-Host "`n  --- Properties ---"
            foreach ($p in $t.GetProperties([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
                Write-Host "  $($p.PropertyType.Name) $($p.Name)"
            }
            
            # List all events
            Write-Host "`n  --- Events ---"
            foreach ($e in $t.GetEvents([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
                Write-Host "  $($e.EventHandlerType.Name) $($e.Name)"
            }
        }
    }
    
    # Also look for any enum types with command-like names
    Write-Host "`n=== Command/Status Enums ==="
    foreach ($t in $types) {
        if ($t.IsEnum -and ($t.Name -match 'Command|Cmd|Opcode|Request|Status|Function|Operation|MessageType|PacketType|FunctionCode|DeviceCommand')) {
            Write-Host "`n  $($t.FullName):"
            foreach ($v in [Enum]::GetValues($t)) {
                Write-Host "    $v = $([int]$v)"
            }
        }
    }
    
} catch [System.Reflection.ReflectionTypeLoadException] {
    $ex = $_.Exception
    Write-Host "Partial load - some types failed:"
    if ($ex.Types) {
        foreach ($t in $ex.Types) {
            if ($t -ne $null -and ($t.Name -like '*UsbDev*' -or $t.FullName -like '*Device*')) {
                Write-Host "`n=== Found (partial): $($t.FullName) ==="
                try {
                    foreach ($m in $t.GetMethods([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
                        $params = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name) $($_.Name)" }) -join ', '
                        Write-Host "  $($_.ReturnType.Name) $($m.Name)($params)"
                    }
                } catch {
                    Write-Host "  (method enumeration failed)"
                }
                try {
                    foreach ($f in $t.GetFields([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
                        $val = ""
                        try { if ($f.IsLiteral) { $val = " = " + $f.GetRawConstantValue() } } catch {}
                        Write-Host "  $($f.FieldType.Name) $($f.Name)$val"
                    }
                } catch {
                    Write-Host "  (field enumeration failed)"
                }
                try {
                    foreach ($p in $t.GetProperties([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::DeclaredOnly)) {
                        Write-Host "  $($p.PropertyType.Name) $($p.Name)"
                    }
                } catch {
                    Write-Host "  (property enumeration failed)"
                }
            }
        }
    }
    
    # Also list what types DID load
    $loadedTypes = $ex.Types | Where-Object { $_ -ne $null }
    Write-Host "`n=== Loaded types count: $($loadedTypes.Length) ==="
    $loadedTypes | Where-Object { $_.FullName -match 'ProcyonNet|UsbDev|DeviceCommon|DeviceFunction' } | ForEach-Object {
        Write-Host "  $($_.FullName)"
    }
    
    # List enums
    Write-Host "`n=== Loaded Enums ==="
    $loadedTypes | Where-Object { $_.IsEnum } | ForEach-Object {
        Write-Host "`n  $($_.FullName):"
        try {
            foreach ($v in [Enum]::GetValues($_)) {
                Write-Host "    $v = $([int]$v)"
            }
        } catch {
            Write-Host "    (values unavailable)"
        }
    }
} catch {
    Write-Host "Error: $_"
}

[System.AppDomain]::CurrentDomain.remove_AssemblyResolve($handler)

Write-Host "`n=== Done ==="
