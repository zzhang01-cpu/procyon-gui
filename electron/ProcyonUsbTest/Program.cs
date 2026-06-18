using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Linq;

class Program
{
    const string DLL_PATH = @"C:\Users\zzhang01\Desktop\ProcyonFiles\Procyon.dll";
    const string OUT_PATH = @"C:\Users\zzhang01\Desktop\ProcyonFiles\dll-decompile.txt";

    static StreamWriter _out;
    static MetadataReader _reader;
    static PEReader _pe;

    static void Main()
    {
        using (_out = new StreamWriter(OUT_PATH, false, Encoding.UTF8))
        {
            Log("=== Procyon.dll .NET Decompile ===");
            Log($"Time: {DateTime.Now}");
            Log($"DLL: {DLL_PATH}");
            Log($"Size: {new FileInfo(DLL_PATH).Length} bytes");
            Log("");

            try
            {
                AnalyzeWithPEReader();
            }
            catch (Exception ex)
            {
                Log($"PEReader FAILED: {ex.GetType().Name}: {ex.Message}");
                if (ex.InnerException != null)
                    Log($"  Inner: {ex.InnerException.Message}");
                Log("\nFalling back to raw byte analysis...");
                RawByteAnalysis();
            }
        }

        Console.WriteLine($"\nDone! Output: {OUT_PATH}");
    }

    static void Log(string msg)
    {
        _out.WriteLine(msg);
        Console.WriteLine(msg);
    }

    // ============================================================
    // Phase 1: PEReader + MetadataReader
    // ============================================================
    static void AnalyzeWithPEReader()
    {
        using var stream = File.OpenRead(DLL_PATH);
        using var pe = new PEReader(stream);
        _pe = pe;

        var header = pe.PEHeaders;
        Log($"Machine: 0x{header.CoffHeader.Machine:X4}");
        Log($"NumberOfSections: {header.CoffHeader.NumberOfSections}");
        Log($"PE NumberOfRvaAndSizes: {header.PEHeader?.NumberOfRvaAndSizes ?? 0}");

        var corHeader = header.CorHeader;
        if (corHeader != null)
        {
            Log($"CLR Header found!");
            Log($"  Metadata RVA=0x{corHeader.MetadataDirectory.RelativeVirtualAddress:X8} Size={corHeader.MetadataDirectory.Size}");
            Log($"  Flags: {corHeader.Flags}");
            Log($"  EntryPoint: 0x{corHeader.EntryPointTokenOrRelativeVirtualAddress:X8}");
            Log($"  Resources RVA=0x{corHeader.ResourcesDirectory.RelativeVirtualAddress:X8} Size={corHeader.ResourcesDirectory.Size}");
        }
        else
        {
            Log("No CLR header in PE data directories.");
        }

        Log($"\nHasMetadata: {pe.HasMetadata}");

        if (!pe.HasMetadata)
        {
            Log("No .NET metadata via PEReader. Trying raw scan...");
            RawByteAnalysis();
            return;
        }

        var reader = pe.GetMetadataReader();
        _reader = reader;

        Log($"Metadata version: {reader.MetadataVersion}");

        // ---- 1) ALL type names (index for reference) ----
        Log("\n========== ALL TYPE NAMES ==========");
        var typeIndex = 0;
        foreach (var tdh in reader.TypeDefinitions)
        {
            var td = reader.GetTypeDefinition(tdh);
            var name = reader.GetString(td.Name);
            var ns = reader.GetString(td.Namespace);
            var fullName = string.IsNullOrEmpty(ns) ? name : $"{ns}.{name}";
            Log($"  [{typeIndex:D4}] {fullName}");
            typeIndex++;
        }
        Log($"Total types: {typeIndex}");

        // ---- 2) ALL enums (command codes might be here) ----
        Log("\n========== ALL ENUMS ==========");
        foreach (var tdh in reader.TypeDefinitions)
        {
            var td = reader.GetTypeDefinition(tdh);
            var name = reader.GetString(td.Name);
            var ns = reader.GetString(td.Namespace);

            if (IsEnumType(td, reader))
            {
                var fullName = string.IsNullOrEmpty(ns) ? name : $"{ns}.{name}";
                Log($"\n--- ENUM: {fullName} ---");
                foreach (var fh in td.GetFields())
                {
                    var field = reader.GetFieldDefinition(fh);
                    var fieldName = reader.GetString(field.Name);
                    if (fieldName == "value__") continue;

                    var cvh = field.GetDefaultValue();
                    if (!cvh.IsNil)
                    {
                        try
                        {
                            var constant = reader.GetConstant(cvh);
                            var blobReader = reader.GetBlobReader(constant.Value);
                            var val = FormatConstantValue(constant.TypeCode, blobReader);
                            Log($"  {fieldName} = {val}");
                        }
                        catch { Log($"  {fieldName} = (error reading)"); }
                    }
                }
            }
        }

        // ---- 3) RELEVANT types detail ----
        Log("\n========== RELEVANT TYPES (DETAIL) ==========");
        foreach (var tdh in reader.TypeDefinitions)
        {
            var td = reader.GetTypeDefinition(tdh);
            var name = reader.GetString(td.Name);
            var ns = reader.GetString(td.Namespace);

            if (IsRelevantName(name) || IsRelevantName(ns))
            {
                var fullName = string.IsNullOrEmpty(ns) ? name : $"{ns}.{name}";
                Log($"\n{'='}");
                Log($"TYPE: {fullName}");
                Log($"{'='}");
                DumpTypeDetails(reader, td);
            }
        }

        // ---- 4) KEY METHOD IL DUMP ----
        Log("\n========== KEY METHOD IL ==========");
        foreach (var tdh in reader.TypeDefinitions)
        {
            var td = reader.GetTypeDefinition(tdh);
            var typeName = reader.GetString(td.Name);

            foreach (var mh in td.GetMethods())
            {
                var method = reader.GetMethodDefinition(mh);
                var methodName = reader.GetString(method.Name);

                if (IsKeyMethod(methodName))
                {
                    var rva = method.RelativeVirtualAddress;
                    if (rva == 0) continue;

                    try
                    {
                        var body = pe.GetMethodBody(rva);
                        if (body == null) continue;
                        var il = body.GetILBytes();
                        Log($"\n--- {typeName}.{methodName} (RVA=0x{rva:X8}, IL={il.Length}B) ---");
                        DumpILHex(il);
                        ScanILForConstants(il, $"{typeName}.{methodName}");
                        ScanILForCalls(il, $"{typeName}.{methodName}");
                    }
                    catch (Exception ex)
                    {
                        Log($"  Error: {ex.Message}");
                    }
                }
            }
        }

        // ---- 5) GLOBAL COMMAND CODE SCAN ----
        Log("\n========== COMMAND CODE SCAN (ALL METHODS) ==========");
        ScanAllMethodsForCommandCodes(reader, pe);
    }

    // ============================================================
    // Type detail dump
    // ============================================================
    static void DumpTypeDetails(MetadataReader reader, TypeDefinition td)
    {
        if (!td.BaseType.IsNil)
            Log($"  Base: {FormatHandle(reader, td.BaseType)}");
        Log($"  Attributes: {td.Attributes}");

        Log($"  --- Fields ---");
        foreach (var fh in td.GetFields())
        {
            var field = reader.GetFieldDefinition(fh);
            var fieldName = reader.GetString(field.Name);
            var cvh = field.GetDefaultValue();
            string defVal = "";
            if (!cvh.IsNil)
            {
                try
                {
                    var constant = reader.GetConstant(cvh);
                    var blobReader = reader.GetBlobReader(constant.Value);
                    defVal = $" = {FormatConstantValue(constant.TypeCode, blobReader)}";
                }
                catch { defVal = " = (error)"; }
            }
            Log($"  [Field] {fieldName} (attrs={field.Attributes}){defVal}");
        }

        Log($"  --- Properties ---");
        foreach (var ph in td.GetProperties())
        {
            var prop = reader.GetPropertyDefinition(ph);
            Log($"  [Prop] {reader.GetString(prop.Name)}");
        }

        Log($"  --- Methods ---");
        foreach (var mh in td.GetMethods())
        {
            var method = reader.GetMethodDefinition(mh);
            var methodName = reader.GetString(method.Name);
            var rva = method.RelativeVirtualAddress;
            Log($"  [Method] {methodName} (RVA=0x{rva:X8}, flags={method.Attributes})");
        }

        Log($"  --- Events ---");
        foreach (var eh in td.GetEvents())
        {
            var evt = reader.GetEventDefinition(eh);
            Log($"  [Event] {reader.GetString(evt.Name)}");
        }
    }

    // ============================================================
    // IL Analysis
    // ============================================================
    static void DumpILHex(byte[] il)
    {
        const int bytesPerLine = 32;
        for (int i = 0; i < il.Length; i += bytesPerLine)
        {
            var sb = new StringBuilder();
            sb.Append($"  {i:X6}: ");
            for (int j = 0; j < bytesPerLine && i + j < il.Length; j++)
                sb.Append($"{il[i + j]:X2} ");
            Log(sb.ToString());
        }
    }

    static void ScanILForConstants(byte[] il, string label)
    {
        var constants = new List<(int offset, int value)>();
        for (int i = 0; i < il.Length;)
        {
            byte op = il[i];
            int val = 0;
            bool found = false;
            int advance = 1;

            // ldc.i4.0 .. ldc.i4.8
            if (op >= 0x16 && op <= 0x1E) { val = op - 0x16; found = true; advance = 1; }
            else if (op == 0x15) { val = -1; found = true; advance = 1; } // ldc.i4.m1
            else if (op == 0x1F && i + 1 < il.Length) { val = (sbyte)il[i + 1]; found = true; advance = 2; } // ldc.i4.s
            else if (op == 0x20 && i + 4 < il.Length) { val = BitConverter.ToInt32(il, i + 1); found = true; advance = 5; } // ldc.i4
            else { advance = GetOpcodeLength(op, il, i); }

            if (found && val >= 0x0001 && val <= 0xFFFF)
                constants.Add((i, val));

            i += advance;
        }

        if (constants.Count > 0)
        {
            Log($"  Constants (0x0001-0xFFFF):");
            foreach (var (offset, value) in constants.OrderBy(c => c.offset))
                Log($"    IL_{offset:D4}: 0x{value:X4} ({value})");
        }
    }

    static void ScanILForCalls(byte[] il, string label)
    {
        var calls = new List<(int offset, uint token, string kind)>();
        for (int i = 0; i < il.Length;)
        {
            byte op = il[i];
            string kind = null;
            int advance;

            if (op == 0x28 && i + 4 < il.Length) { kind = "call"; advance = 5; }
            else if (op == 0x6F && i + 4 < il.Length) { kind = "callvirt"; advance = 5; }
            else if (op == 0x73 && i + 4 < il.Length) { kind = "newobj"; advance = 5; }
            else if (op == 0x72 && i + 4 < il.Length) { kind = "ldstr"; advance = 5; }
            else { advance = GetOpcodeLength(op, il, i); }

            if (kind != null)
            {
                uint token = BitConverter.ToUInt32(il, i + 1);
                calls.Add((i, token, kind));
            }

            i += advance;
        }

        if (calls.Count > 0)
        {
            Log($"  Calls/Strings:");
            foreach (var (offset, token, kind) in calls)
            {
                string target = ResolveToken(token);
                Log($"    IL_{offset:D4}: {kind} {target}");
            }
        }
    }

    static string ResolveToken(uint token)
    {
        if (_reader == null) return $"0x{token:X8}";

        var table = (token >> 24);
        var row = (int)(token & 0x00FFFFFF);

        try
        {
            switch (table)
            {
                case 0x0A: // MemberRef
                    var mr = _reader.GetMemberReference((MemberReferenceHandle)MetadataTokens.Handle((int)token));
                    var mrName = _reader.GetString(mr.Name);
                    var parent = FormatHandle(_reader, mr.Parent);
                    return $"{parent}::{mrName}";

                case 0x06: // Method
                    var mh = MetadataTokens.MethodDefinitionHandle(row);
                    var md = _reader.GetMethodDefinition(mh);
                    var methodName = _reader.GetString(md.Name);
                    // Try to get declaring type
                    var declType = md.GetDeclaringType();
                    if (!declType.IsNil)
                    {
                        var dt = _reader.GetTypeDefinition(declType);
                        var dtName = _reader.GetString(dt.Name);
                        return $"{dtName}::{methodName}";
                    }
                    return $"Method::{methodName}";

                case 0x04: // Field
                    return $"Field#{row}";

                case 0x01: // TypeRef
                    var tr = _reader.GetTypeReference((TypeReferenceHandle)MetadataTokens.Handle((int)token));
                    return $"TypeRef::{_reader.GetString(tr.Namespace)}.{_reader.GetString(tr.Name)}";

                case 0x02: // TypeDef
                    var tdef = _reader.GetTypeDefinition(MetadataTokens.TypeDefinitionHandle(row));
                    return $"TypeDef::{_reader.GetString(tdef.Name)}";

                case 0x70: // User string
                    var us = _reader.GetUserString(MetadataTokens.UserStringHandle(row));
                    return $"\"{us}\"";

                default:
                    return $"Table{table:X2}#{row}";
            }
        }
        catch
        {
            return $"0x{token:X8}";
        }
    }

    // Minimal opcode length table for skipping unknown opcodes
    static int GetOpcodeLength(byte op, byte[] il, int offset)
    {
        // Two-byte prefix
        if (op == 0xFE && offset + 1 < il.Length)
        {
            byte op2 = il[offset + 1];
            // Most FE.xx are 2-byte opcodes, some take operands
            if (op2 == 0x09 || op2 == 0x0A || op2 == 0x0B || op2 == 0x0C || op2 == 0x0E)
                return 4; // ldarg/ldarga/starg/ldloc/stloc (2-byte index)
            return 2;
        }

        // Single-byte opcodes with inline operands
        if (op == 0x20) return 5;  // ldc.i4
        if (op == 0x21) return 9;  // ldc.i8
        if (op == 0x22) return 1;  // ldnull
        if (op == 0x72) return 5;  // ldstr
        if (op == 0x28 || op == 0x6F || op == 0x73) return 5; // call/callvirt/newobj
        if (op == 0x8C || op == 0x79) return 5; // box/unbox.any
        if (op == 0x38 || op == 0x39 || op == 0x3A) return 5; // br/brfalse/brtrue
        if (op == 0x3B || op == 0x3C || op == 0x3D || op == 0x3E || op == 0x3F ||
            op == 0x40 || op == 0x41 || op == 0x42 || op == 0x43) return 5; // beq/bge/bgt/ble/blt etc.
        if (op == 0x44 || op == 0x45) return 5; // bge.un / bgt.un
        if (op == 0x1F) return 2;  // ldc.i4.s
        if (op == 0x0E || op == 0x0F || op == 0x10 || op == 0x11 || op == 0x12 || op == 0x13) return 2; // ldarg.s etc
        if (op == 0x2B || op == 0x2C || op == 0x2D || op == 0x2E || op == 0x2F ||
            op == 0x30 || op == 0x31 || op == 0x32 || op == 0x33 || op == 0x34 ||
            op == 0x35 || op == 0x36 || op == 0x37) return 2; // br.s etc
        if (op == 0xDE) return 4;  // leave
        if (op == 0xDD) return 5;  // leave (long form?)

        return 1; // Default: single-byte opcode
    }

    // ============================================================
    // Command code scan across all methods
    // ============================================================
    static void ScanAllMethodsForCommandCodes(MetadataReader reader, PEReader pe)
    {
        var knownCodes = new HashSet<int> {
            0x0005, 0x000A, 0x000C, 0x000E, 0x001F,
            0x0030, 0x0032, 0x0034,
            0x0040, 0x0042, 0x0046,
            0x0050, 0x0052, 0x0054, 0x0056,
            0x0096,
            0x0100, 0x0102, 0x0104, 0x0106, 0x0108, 0x010A, 0x010C, 0x010E,
            0x0140, 0x0142, 0x0144, 0x0146, 0x0148, 0x014A, 0x014C, 0x014E,
            0x0154, 0x0156, 0x0158, 0x015A
        };

        foreach (var tdh in reader.TypeDefinitions)
        {
            var td = reader.GetTypeDefinition(tdh);
            var typeName = reader.GetString(td.Name);

            foreach (var mh in td.GetMethods())
            {
                var method = reader.GetMethodDefinition(mh);
                var methodName = reader.GetString(method.Name);
                var rva = method.RelativeVirtualAddress;
                if (rva == 0) continue;

                try
                {
                    var body = pe.GetMethodBody(rva);
                    if (body == null) continue;
                    var il = body.GetILBytes();

                    for (int i = 0; i < il.Length;)
                    {
                        byte op = il[i];
                        int val = -1;
                        int advance;

                        if (op >= 0x16 && op <= 0x1E) { val = op - 0x16; advance = 1; }
                        else if (op == 0x15) { val = -1; advance = 1; }
                        else if (op == 0x1F && i + 1 < il.Length) { val = (sbyte)il[i + 1]; advance = 2; }
                        else if (op == 0x20 && i + 4 < il.Length) { val = BitConverter.ToInt32(il, i + 1); advance = 5; }
                        else { advance = GetOpcodeLength(op, il, i); }

                        if (val >= 0 && (knownCodes.Contains(val) || (val >= 0x0100 && val <= 0x0200)))
                        {
                            Log($"  {typeName}.{methodName} @ IL_{i:D4}: ldc 0x{val:X4} ({val})");
                        }

                        i += advance;
                    }
                }
                catch { }
            }
        }
    }

    // ============================================================
    // Raw byte analysis (fallback if no .NET metadata)
    // ============================================================
    static void RawByteAnalysis()
    {
        var bytes = File.ReadAllBytes(DLL_PATH);
        Log($"\n=== RAW BYTE ANALYSIS ===");
        Log($"File size: {bytes.Length} bytes");

        // 1. Search for BSJB signature
        Log("\n--- BSJB (.NET metadata signature) ---");
        int bsjbCount = 0;
        for (int i = 0; i < bytes.Length - 4; i++)
        {
            if (bytes[i] == 0x42 && bytes[i + 1] == 0x53 && bytes[i + 2] == 0x4A && bytes[i + 3] == 0x42)
            {
                Log($"  BSJB at offset 0x{i:X8}");
                bsjbCount++;
                ParseMetadataHeader(bytes, i);
                if (bsjbCount >= 3) break;
            }
        }
        if (bsjbCount == 0) Log("  No BSJB found!");

        // 2. Command code table search
        Log("\n--- Command code table patterns ---");
        SearchCommandCodeTable(bytes);

        // 3. Targeted string searches
        string[] searchTerms = {
            "DelayBetweenWrites", "SetDeviceParameter", "CommandDeviceAsync",
            "WriteIntoFlash", "CommandResponseConfig", "GetCommandConfig",
            "WriteToDeviceAsync", "ReadFromDeviceAsync", "SendTypedCommand"
        };
        foreach (var term in searchTerms)
        {
            Log($"\n--- \"{term}\" ---");
            SearchNearString(bytes, term, 256);
        }
    }

    static void ParseMetadataHeader(byte[] bytes, int bsjbOffset)
    {
        if (bsjbOffset + 16 >= bytes.Length) return;
        uint metaDataLength = BitConverter.ToUInt32(bytes, bsjbOffset + 4);
        Log($"    Metadata length: {metaDataLength}");
        uint versionLength = BitConverter.ToUInt32(bytes, bsjbOffset + 8);
        if (bsjbOffset + 12 + versionLength < bytes.Length)
        {
            var version = Encoding.ASCII.GetString(bytes, bsjbOffset + 12, (int)Math.Min(versionLength, 256)).TrimEnd('\0');
            Log($"    Version: {version}");
        }

        int pos = bsjbOffset + 12 + (int)versionLength;
        pos = (pos + 3) & ~3; // align
        if (pos + 4 >= bytes.Length) return;

        ushort flags = BitConverter.ToUInt16(bytes, pos);
        ushort streams = BitConverter.ToUInt16(bytes, pos + 2);
        Log($"    Flags: {flags}, Streams: {streams}");
        pos += 4;

        for (int s = 0; s < streams && pos + 8 < bytes.Length; s++)
        {
            uint offset = BitConverter.ToUInt32(bytes, pos);
            uint size = BitConverter.ToUInt32(bytes, pos + 4);
            int nameStart = pos + 8;
            int nameEnd = nameStart;
            while (nameEnd < bytes.Length && bytes[nameEnd] != 0) nameEnd++;
            var streamName = Encoding.ASCII.GetString(bytes, nameStart, nameEnd - nameStart);
            Log($"    Stream: \"{streamName}\" offset=0x{offset:X} size={size}");

            if (streamName == "#Strings")
            {
                int streamStart = bsjbOffset + (int)offset;
                DumpStringsHeap(bytes, streamStart, (int)size);
            }

            int nameLen = nameEnd - nameStart + 1;
            nameLen = (nameLen + 3) & ~3;
            pos = nameStart + nameLen;
        }
    }

    static void DumpStringsHeap(byte[] bytes, int start, int size)
    {
        Log($"      --- #Strings (relevant entries) ---");
        int end = Math.Min(start + size, start + 65536);
        int pos = start;
        while (pos < end)
        {
            int strStart = pos;
            while (pos < end && bytes[pos] != 0) pos++;
            if (pos > strStart)
            {
                var str = Encoding.UTF8.GetString(bytes, strStart, pos - strStart);
                if (IsRelevantName(str))
                {
                    Log($"        [{strStart - start:D5}] {str}");
                }
            }
            pos++;
        }
    }

    static void SearchCommandCodeTable(byte[] bytes)
    {
        for (int i = 0; i < bytes.Length - 64; i++)
        {
            int matchCount = 0;
            for (int j = 0; j < 32; j += 2)
            {
                if (i + j + 1 >= bytes.Length) break;
                ushort val = BitConverter.ToUInt16(bytes, i + j);
                if (val >= 0x0001 && val <= 0x0200)
                    matchCount++;
                else
                    break;
            }

            if (matchCount >= 6)
            {
                bool hasKnown = false;
                for (int j = 0; j < matchCount * 2; j += 2)
                {
                    ushort val = BitConverter.ToUInt16(bytes, i + j);
                    if (val == 0x0005 || val == 0x0040 || val == 0x0042 || val == 0x0046 ||
                        val == 0x0102 || val == 0x0106 || val == 0x014C || val == 0x0096)
                    { hasKnown = true; break; }
                }

                if (hasKnown)
                {
                    var sb = new StringBuilder();
                    sb.Append($"  Table at 0x{i:X8}: ");
                    for (int j = 0; j < matchCount * 2 && j < 64; j += 2)
                    {
                        ushort val = BitConverter.ToUInt16(bytes, i + j);
                        sb.Append($"0x{val:X4} ");
                    }
                    Log(sb.ToString());
                }
            }
        }
    }

    static void SearchNearString(byte[] bytes, string target, int range)
    {
        var targetBytes = Encoding.ASCII.GetBytes(target);
        for (int i = 0; i < bytes.Length - targetBytes.Length; i++)
        {
            bool match = true;
            for (int j = 0; j < targetBytes.Length; j++)
            {
                if (bytes[i + j] != targetBytes[j]) { match = false; break; }
            }
            if (!match) continue;

            Log($"  Found at 0x{i:X8}");

            // After the string, look for nearby data
            int afterEnd = Math.Min(bytes.Length, i + targetBytes.Length + range);
            Log($"  After (0x{i:X8}, next {range}B):");
            for (int row = i + targetBytes.Length; row < afterEnd; row += 16)
            {
                var hex = new StringBuilder();
                var ascii = new StringBuilder();
                hex.Append($"    {row:X8}: ");
                for (int col = 0; col < 16 && row + col < afterEnd; col++)
                {
                    hex.Append($"{bytes[row + col]:X2} ");
                    char c = (char)bytes[row + col];
                    ascii.Append(char.IsControl(c) ? '.' : c);
                }
                hex.Append($" | {ascii}");
                Log(hex.ToString());
            }
            break;
        }
    }

    // ============================================================
    // Helpers
    // ============================================================
    static bool IsRelevantName(string name)
    {
        if (string.IsNullOrEmpty(name)) return false;
        var lower = name.ToLowerInvariant();
        return lower.Contains("command") || lower.Contains("device") ||
               lower.Contains("write") || lower.Contains("flash") ||
               lower.Contains("delay") || lower.Contains("config") ||
               lower.Contains("parameter") || lower.Contains("usb") ||
               lower.Contains("endpoint") || lower.Contains("bulk") ||
               lower.Contains("procyon") || lower.Contains("customer") ||
               lower.Contains("country") || lower.Contains("district") ||
               lower.Contains("tool") || lower.Contains("serial") ||
               lower.Contains("battery") || lower.Contains("temperature") ||
               lower.Contains("pressure") || lower.Contains("depth") ||
               lower.Contains("ldap") || lower.Contains("unique") ||
               lower.Contains("housing") || lower.Contains("drill") ||
               lower.Contains("amplifier") || lower.Contains("shock") ||
               lower.Contains("gyro") || lower.Contains("accel") ||
               lower.Contains("limpet") || lower.Contains("firmware") ||
               lower.Contains("selftest") || lower.Contains("self_test") ||
               lower.Contains("position") || lower.Contains("axial") ||
               lower.Contains("dac") || lower.Contains("gain") ||
               lower.Contains("offset") || lower.Contains("mode") ||
               lower.Contains("memory") || lower.Contains("dump") ||
               lower.Contains("erase") || lower.Contains("partition") ||
               lower.Contains("verification") || lower.Contains("abort") ||
               lower.Contains("reader") || lower.Contains("writer") ||
               lower.Contains("logger") || lower.Contains("run_id") ||
               lower.Contains("connection") || lower.Contains("size");
    }

    static bool IsKeyMethod(string name)
    {
        if (string.IsNullOrEmpty(name)) return false;
        var lower = name.ToLowerInvariant();
        return lower.Contains("commanddevice") || lower.Contains("setdevice") ||
               lower.Contains("writeintoflash") || lower.Contains("writetodevice") ||
               lower.Contains("readfromdevice") || lower.Contains("delaybetween") ||
               lower.Contains("getcommandconfig") || lower.Contains("sendtyped") ||
               lower.Contains("settool") || lower.Contains("setreset") ||
               lower.Contains("dumpdata") || lower.Contains("commandresponse") ||
               lower.Contains("iscommand") || lower.Contains("setrun") ||
               lower.Contains("setcustomer") || lower.Contains("setcountry") ||
               lower.Contains("setdistrict") || lower.Contains("setdepth") ||
               lower.Contains("setdevice") || lower.Contains("setunique") ||
               lower.Contains("setldap") || lower.Contains("setconfig") ||
               lower.Contains("setparameters") || lower.Contains("memorydump") ||
               lower.Contains("memoryerase") || lower.Contains("startverification");
    }

    static bool IsEnumType(TypeDefinition td, MetadataReader reader)
    {
        if (!td.Attributes.HasFlag(System.Reflection.TypeAttributes.Sealed))
            return false;

        bool hasValueField = false;
        foreach (var fh in td.GetFields())
        {
            var field = reader.GetFieldDefinition(fh);
            if (reader.GetString(field.Name) == "value__")
            { hasValueField = true; break; }
        }
        return hasValueField;
    }

    static string FormatConstantValue(ConstantTypeCode typeCode, BlobReader reader)
    {
        return typeCode switch
        {
            ConstantTypeCode.Boolean => reader.ReadBoolean().ToString(),
            ConstantTypeCode.Byte => $"0x{reader.ReadByte():X2}",
            ConstantTypeCode.SByte => reader.ReadSByte().ToString(),
            ConstantTypeCode.Int16 => reader.ReadInt16().ToString(),
            ConstantTypeCode.UInt16 => $"0x{reader.ReadUInt16():X4}",
            ConstantTypeCode.Int32 => reader.ReadInt32().ToString(),
            ConstantTypeCode.UInt32 => $"0x{reader.ReadUInt32():X8}",
            ConstantTypeCode.Int64 => reader.ReadInt64().ToString(),
            ConstantTypeCode.UInt64 => $"0x{reader.ReadUInt64():X16}",
            ConstantTypeCode.Single => reader.ReadSingle().ToString("F6"),
            ConstantTypeCode.Double => reader.ReadDouble().ToString("F10"),
            _ => $"({typeCode})"
        };
    }

    static string FormatHandle(MetadataReader reader, EntityHandle handle)
    {
        if (handle.IsNil) return "<nil>";
        try
        {
            switch (handle.Kind)
            {
                case HandleKind.TypeReference:
                    var tr = reader.GetTypeReference((TypeReferenceHandle)handle);
                    var trNs = reader.GetString(tr.Namespace);
                    var trName = reader.GetString(tr.Name);
                    return string.IsNullOrEmpty(trNs) ? trName : $"{trNs}.{trName}";
                case HandleKind.TypeDefinition:
                    var td = reader.GetTypeDefinition((TypeDefinitionHandle)handle);
                    var tdNs = reader.GetString(td.Namespace);
                    var tdName = reader.GetString(td.Name);
                    return string.IsNullOrEmpty(tdNs) ? tdName : $"{tdNs}.{tdName}";
                default:
                    return $"{handle.Kind}:{handle}";
            }
        }
        catch { return $"{handle.Kind}:{handle}"; }
    }
}
