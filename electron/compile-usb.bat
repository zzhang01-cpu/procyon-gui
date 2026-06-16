@echo off
echo ============================================
echo   Compiling Procyon USB Bridge (WinUSB)
echo ============================================
echo.

REM Check .NET Framework csc compiler
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" (
    echo ERROR: .NET Framework 4.0 not found!
    echo Please install .NET Framework 4.x from Microsoft.
    pause
    exit /b 1
)

echo Found compiler: %CSC%
echo.

REM Compile
%CSC% /nologo /out:procyon-usb.exe procyon-usb.cs

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================
    echo   SUCCESS: procyon-usb.exe created!
    echo ============================================
    echo.
    echo Now run the test:
    echo   procyon-usb.exe test
    echo.
) else (
    echo.
    echo ERROR: Compilation failed!
)

pause
