using System;
using System.IO;
using System.Text;
using System.Reflection.Metadata;
using System.Reflection.Metadata.Ecma335;
using System.Collections.Generic;

class Program
{
    static string outputPath = @"C:\Users\zzhang01\Desktop\ProcyonFiles\dll-decompile.txt";
    static StreamWriter outWriter;

    static void Main(string[] args)
    {
        string dllPath = @"C:\Users\zzhang01\Desktop\ProcyonFiles\Procyon.dll";
        if (!File.Exists(dllPath))
        {
            Console.WriteLine("DLL not found: " + dllPath);
            return;
        }

        using (outWriter = new StreamWriter(outputPath, false, Encoding.UTF8))
        {
            Log("=== Procyon.dll .NET Metadata Decompiler ===");
            Log("File: " + dllPath);
            Log("Size: " + new FileInfo(dllPath).Length + " bytes");
            Log("");

            // Step 1: Raw PE check for CLR header at CORRECT x64 offset
            byte[] pe = File.ReadAllBytes(dllPath);
            int peOffset = BitConverter.ToInt32(pe, 0x3C);
            ushort machine = BitConverter.ToUInt16(pe, peOffset + 4);
            bool is64 = (machine == 0x8664);

            Log("Machine: " + (is64 ? "x64" : "x86"));

            // For PE32+ (x64): data directories start at offset 112 from optional header
            // CLR directory is #14 (0-indexed), so offset = 112 + 14*8 = 224
            // For PE32 (x86): data directories start at offset 96
            // CLR directory is #14, so offset = 96 + 14*8 = 208
            int clrDirOffset = is64 ? 224 : 208;
            int clrRVA = BitConverter.ToInt32(pe, peOffset + 24 + clrDirOffset);
            int clrSize = BitConverter.ToInt32(pe, peOffset + 24 + clrDirOffset + 4);

            Log("CLR Header directory offset in opt header: " + clrDirOffset);
            Log("CLR Header RVA: 0x" + clrRVA.ToString("X8") + " Size: " + clrSize);

            if (clrRVA == 0)
            {
                // Try raw search for BSJB metadata signature
                Log("\nCLR RVA is 0. Searching for BSJB metadata signature in raw bytes...");
                bool foundBsjb = false;
                for (int i = 0; i < pe.Length - 4; i++)
                {
                    if (pe[i] == 0x42 && pe[i+1] == 0x53 && pe[i+2] == 0x4A && pe[i+3] == 0x42)
                    {
                        Log("  Found BSJB at file offset 0x" + i.ToString("X8"));
                        foundBsjb = true;
                        // Try to parse metadata from here
                        ParseRawMetadata(pe, i);
                        break;
                    }
                }
                if (!foundBsjb)
                {
                    Log("  No BSJB found. This appears to be a truly native/packed DLL.");
                }
            }
            Log("");

            // Step 2: Try System.Reflection.Metadata PEReader
            Log("=== Attempting PEReader + MetadataReader ===");
            try
            {
                using (var stream = File.OpenRead(dllPath))
                using (var peReader = new PEReader(stream))
                {
                    var metadata = peReader.GetMetadata();
                    var reader = metadata.GetReader();

                    Log("SUCCESS! .NET metadata found via PEReader!");
                    Log("");

                    // Enumerate all type definitions
                    Log("========== ALL TYPES ==========");
                    var typeNames = new List<string>();
                    foreach (var typeDefHandle in reader.TypeDefinitions)
                    {
                        var typeDef = reader.GetTypeDefinition(typeDefHandle);
                        var name = reader.GetString(typeDef.Name);
                        var ns = reader.GetString(typeDef.Namespace);
                        string fullName = string.IsNullOrEmpty(ns) ? name : ns + "." + name;
                        typeNames.Add(fullName);
                    }
                    typeNames.Sort();
                    foreach (var t in typeNames)
                    {
                        Log("  " + t);
                    }
                    Log("\nTotal types: " + typeNames.Count);
                    Log("");

                    // Find and display all enums
                    Log("========== ALL ENUMS ==========");
                    foreach (var typeDefHandle in reader.TypeDefinitions)
                    {
                        var typeDef = reader.GetTypeDefinition(typeDefHandle);
                        var name = reader.GetString(typeDef.Name);
                        var ns = reader.GetString(typeDef.Namespace);
                        string fullName = string.IsNullOrEmpty(ns) ? name : ns + "." + name;

                        // Check if it's an enum (inherits from System.Enum)
                        var baseType = typeDef.BaseType;
                        if (baseType.Kind == HandleKind.TypeReference)
                        {
                            var typeRef = reader.GetTypeReference((TypeReferenceHandle)baseType);
                            string baseName = reader.GetString(typeRef.Name);
                            if (baseName == "Enum")
                            {
                                Log("\n  enum " + fullName);
                                // Enumerate fields
                                foreach (var fieldHandle in typeDef.GetFields())
                                {
                                    var field = reader.GetFieldDefinition(fieldHandle);
                                    string fieldName = reader.GetString(field.Name);
                                    // Skip value__ field
                                    if (fieldName == "value__") continue;

                                    // Try to read constant value
                                    try
                                    {
                                        var constantHandle = field.GetDefaultValue();
                                        if (!constantHandle.IsNil)
                                        {
                                            var constant = reader.GetConstant(constantHandle);
                                            var blobReader = reader.GetBlobReader(constant.Value);
                                            string val = ReadConstantValue(ref blobReader, constant.TypeCode);
                                            Log("    " + fieldName + " = " + val);
                                        }
                                        else
                                        {
                                            Log("    " + fieldName + " = (no default)");
                                        }
                                    }
                                    catch
                                    {
                                        Log("    " + fieldName + " = (error reading)");
                                    }
                                }
                            }
                        }
                    }
                    Log("");

                    // Detailed analysis of command/device related types
                    Log("========== DETAILED TYPE ANALYSIS ==========");
                    string[] importantKeywords = {
                        "UsbDev", "CommandConfig", "DeviceSetting", "ByteConfig",
                        "CommandResponse", "DataSend", "StepParameter"
                    };

                    foreach (var typeDefHandle in reader.TypeDefinitions)
                    {
                        var typeDef = reader.GetTypeDefinition(typeDefHandle);
                        var name = reader.GetString(typeDef.Name);
                        var ns = reader.GetString(typeDef.Namespace);
                        string fullName = string.IsNullOrEmpty(ns) ? name : ns + "." + name;

                        bool isImportant = false;
                        foreach (var kw in importantKeywords)
                        {
                            if (fullName.IndexOf(kw, StringComparison.OrdinalIgnoreCase) >= 0)
                            {
                                isImportant = true;
                                break;
                            }
                        }

                        if (isImportant)
                        {
                            AnalyzeType(reader, typeDef, fullName);
                        }
                    }
                    Log("");

                    // Detailed method IL analysis for key methods
                    Log("========== KEY METHOD IL ANALYSIS ==========");
                    string[] keyMethods = {
                        "CommandDeviceAsync", "SetDeviceParameter", "WriteIntoFlash",
                        "WriteIntoFlashAsync", "WriteToDevice", "WriteToDeviceAsync",
                        "ReadFromDevice", "ReadFromDeviceAsync", "SetDeviceTime",
                        "SetDeviceTimeAsync", "SetToolSN", "SetToolSNAsync",
                        "SetResetTestMode", "GetCommandConfigFromCommand",
                        "GetCommandConfigFromString", "GetCommandConfigFromByteArray",
                        "CommandResponseConfig", "GetByteConfig", "GetDeviceConfig",
                        "SendTypedCommandAsync", "GetValueFromResponse",
                        "GetUnknownStringResponseSize", "GetUnknownFloatResponseSize",
                        "DelayBetweenWrites", "WriteCustomizableInfo",
                        "CMSetInitParameters", "EMSetInitParameters"
                    };

                    foreach (var typeDefHandle in reader.TypeDefinitions)
                    {
                        var typeDef = reader.GetTypeDefinition(typeDefHandle);
                        var typeName = reader.GetString(typeDef.Name);
                        var typeNS = reader.GetString(typeDef.Namespace);
                        string typeFullName = string.IsNullOrEmpty(typeNS) ? typeName : typeNS + "." + typeName;

                        foreach (var methodHandle in typeDef.GetMethods())
                        {
                            var method = reader.GetMethodDefinition(methodHandle);
                            string methodName = reader.GetString(method.Name);

                            foreach (var km in keyMethods)
                            {
                                if (methodName == km)
                                {
                                    AnalyzeMethod(reader, method, methodHandle, typeFullName, typeName);
                                    break;
                                }
                            }
                        }
                    }
                    Log("");

                    // Command code scan across ALL methods
                    Log("========== COMMAND CODE SCAN ==========");
                    ScanCommandCodes(reader);
                }
            }
            catch (Exception ex)
            {
                Log("PEReader failed: " + ex.Message);
                Log("Stack: " + ex.StackTrace);
            }

            Log("\n=== DONE ===");
            Log("Output written to: " + outputPath);
        }

        Console.WriteLine("\nDone! Output: " + outputPath);
    }

    static void Log(string msg)
    {
        Console.WriteLine(msg);
        outWriter.WriteLine(msg);
    }

    static string ReadConstantValue(ref BlobReader reader, ConstantTypeCode typeCode)
    {
        switch (typeCode)
        {
            case ConstantTypeCode.Int32: return reader.ReadInt32().ToString();
            case ConstantTypeCode.UInt32: return "0x" + reader.ReadUInt32().ToString("X8");
            case ConstantTypeCode.Int16: return reader.ReadInt16().ToString();
            case ConstantTypeCode.UInt16: return "0x" + reader.ReadUInt16().ToString("X4");
            case ConstantTypeCode.Byte: return "0x" + reader.ReadByte().ToString("X2");
            case ConstantTypeCode.SByte: return reader.ReadSByte().ToString();
            case ConstantTypeCode.Int64: return "0x" + reader.ReadInt64().ToString("X16");
            case ConstantTypeCode.UInt64: return "0x" + reader.ReadUInt64().ToString("X16");
            case ConstantTypeCode.String: return "\"" + reader.ReadUTF16(reader.RemainingBytes) + "\"";
            default: return "(" + typeCode + ")";
        }
    }

    static void AnalyzeType(MetadataReader reader, TypeDefinition typeDef, string fullName)
    {
        Log("\n--- Type: " + fullName + " ---");
        Log("  Attributes: " + typeDef.Attributes);

        // Fields
        foreach (var fieldHandle in typeDef.GetFields())
        {
            var field = reader.GetFieldDefinition(fieldHandle);
            string fieldName = reader.GetString(field.Name);
            string fieldInfo = "  Field: " + fieldName;

            // Try to read default value
            try
            {
                var constantHandle = field.GetDefaultValue();
                if (!constantHandle.IsNil)
                {
                    var constant = reader.GetConstant(constantHandle);
                    var blobReader = reader.GetBlobReader(constant.Value);
                    fieldInfo += " = " + ReadConstantValue(ref blobReader, constant.TypeCode);
                }
            }
            catch { }

            // Decode field signature for type info
            try
            {
                var sigReader = reader.GetBlobReader(field.Signature);
                // Simple field signature: FIELD (0x06) + CustomMod* + Type
                byte sigByte = sigReader.ReadByte();
                if (sigByte == 0x06)
                {
                    // Read type code
                    fieldInfo += " [sig:" + sigByte.ToString("X2");
                    var typeCode = sigReader.ReadCompressedInteger();
                    fieldInfo += ",type:" + typeCode + "]";
                }
            }
            catch { }

            Log(fieldInfo);
        }

        // Properties
        foreach (var propHandle in typeDef.GetProperties())
        {
            var prop = reader.GetPropertyDefinition(propHandle);
            string propName = reader.GetString(prop.Name);
            Log("  Property: " + propName);
        }

        // Methods
        foreach (var methodHandle in typeDef.GetMethods())
        {
            var method = reader.GetMethodDefinition(methodHandle);
            string methodName = reader.GetString(method.Name);
            Log("  Method: " + methodName);
        }
    }

    static void AnalyzeMethod(MetadataReader reader, MethodDefinition method,
        MethodDefinitionHandle methodHandle, string typeFullName, string typeName)
    {
        string methodName = reader.GetString(method.Name);
        Log("\n--- Method: " + typeFullName + "." + methodName + " ---");
        Log("  Attributes: " + method.Attributes);
        Log("  ImplAttributes: " + method.ImplAttributes);
        Log("  RelativeVirtualAddress: 0x" + method.RelativeVirtualAddress.ToString("X8"));

        // Decode method signature
        try
        {
            var sigReader = reader.GetBlobReader(method.Signature);
            byte sigByte = sigReader.ReadByte();
            // Method signature header
            bool generic = (sigByte & 0x10) != 0;
            bool hasThis = (sigByte & 0x20) != 0;
            int paramCount;

            if (generic)
            {
                int genParamCount = sigReader.ReadCompressedInteger();
                paramCount = sigReader.ReadCompressedInteger();
                Log("  Signature: generic(" + genParamCount + ") params=" + paramCount);
            }
            else
            {
                paramCount = sigReader.ReadCompressedInteger();
                Log("  Signature: params=" + paramCount + (hasThis ? " instance" : ""));
            }

            // Read return type
            int retTypeCode = sigReader.ReadCompressedInteger();
            Log("  ReturnType code: " + retTypeCode);

            // Read parameter types
            for (int i = 0; i < paramCount && i < 10; i++)
            {
                try
                {
                    int pTypeCode = sigReader.ReadCompressedInteger();
                    Log("  Param" + i + " type code: " + pTypeCode);
                }
                catch { break; }
            }
        }
        catch (Exception ex)
        {
            Log("  Signature decode error: " + ex.Message);
        }

        // Read method body (IL)
        try
        {
            var methodBody = reader.GetMethodBody(methodHandle);
            if (methodBody != null)
            {
                var ilReader = reader.GetBlobReader(methodBody);

                // Extract constants, calls, strings from IL
                var constants = new List<string>();
                var calls = new List<string>();
                var strings = new List<string>();
                var localSig = "";

                // Local variables
                if (!methodBody.LocalSignature.IsNil)
                {
                    localSig = "LocalSig: " + MetadataTokens.GetToken(methodBody.LocalSignature).ToString("X8");
                }

                // MaxStack
                Log("  MaxStack: " + methodBody.MaxStack);
                if (localSig != "") Log("  " + localSig);

                // Hex dump + decode
                byte[] ilBytes = new byte[ilReader.RemainingBytes];
                ilReader.ReadBytes(ilBytes);

                // Show hex (first 256 bytes)
                Log("  IL Hex (first 256):");
                StringBuilder hexLine = new StringBuilder();
                for (int i = 0; i < Math.Min(ilBytes.Length, 256); i++)
                {
                    hexLine.Append(ilBytes[i].ToString("X2") + " ");
                    if ((i + 1) % 32 == 0)
                    {
                        Log("    " + hexLine.ToString());
                        hexLine.Clear();
                    }
                }
                if (hexLine.Length > 0) Log("    " + hexLine.ToString());
                Log("  IL length: " + ilBytes.Length + " bytes");

                // Decode IL for key patterns
                DecodeIL(reader, ilBytes, constants, calls, strings);

                if (constants.Count > 0)
                {
                    Log("  Constants (ldc.i4):");
                    foreach (var c in constants) Log("    " + c);
                }
                if (calls.Count > 0)
                {
                    Log("  Calls:");
                    foreach (var c in calls) Log("    " + c);
                }
                if (strings.Count > 0)
                {
                    Log("  Strings (ldstr):");
                    foreach (var s in strings) Log("    " + s);
                }
            }
            else
            {
                Log("  No method body (abstract/extern/PInvoke)");
            }
        }
        catch (Exception ex)
        {
            Log("  Method body error: " + ex.Message);
        }
    }

    static void DecodeIL(MetadataReader reader, byte[] il,
        List<string> constants, List<string> calls, List<string> strings)
    {
        int pos = 0;
        while (pos < il.Length)
        {
            byte op = il[pos];
            switch (op)
            {
                // ldc.i4 (short forms)
                case 0x16: // ldc.i4.0
                    constants.Add("0");
                    pos++; break;
                case 0x17: // ldc.i4.1
                    constants.Add("1");
                    pos++; break;
                case 0x18: // ldc.i4.2
                    constants.Add("2");
                    pos++; break;
                case 0x19: // ldc.i4.3
                    constants.Add("3");
                    pos++; break;
                case 0x1A: // ldc.i4.4
                    constants.Add("4");
                    pos++; break;
                case 0x1B: // ldc.i4.5
                    constants.Add("5");
                    pos++; break;
                case 0x1C: // ldc.i4.6
                    constants.Add("6");
                    pos++; break;
                case 0x1D: // ldc.i4.7
                    constants.Add("7");
                    pos++; break;
                case 0x1E: // ldc.i4.8
                    constants.Add("8");
                    pos++; break;
                case 0x15: // ldc.i4.M1
                    constants.Add("-1");
                    pos++; break;
                case 0x1F: // ldc.i4.s
                    if (pos + 1 < il.Length)
                    {
                        sbyte val = (sbyte)il[pos + 1];
                        constants.Add(val.ToString() + " (0x" + ((byte)val).ToString("X2") + ")");
                        pos += 2;
                    }
                    else pos = il.Length;
                    break;
                case 0x20: // ldc.i4
                    if (pos + 4 < il.Length)
                    {
                        int val = BitConverter.ToInt32(il, pos + 1);
                        constants.Add(val.ToString() + " (0x" + val.ToString("X8") + ")");
                        pos += 5;
                    }
                    else pos = il.Length;
                    break;
                case 0x21: // ldc.i8
                    if (pos + 8 < il.Length)
                    {
                        long val = BitConverter.ToInt64(il, pos + 1);
                        constants.Add("i8:" + val.ToString() + " (0x" + val.ToString("X16") + ")");
                        pos += 9;
                    }
                    else pos = il.Length;
                    break;
                case 0x22: // ldc.r4
                    if (pos + 4 < il.Length)
                    {
                        float val = BitConverter.ToSingle(il, pos + 1);
                        constants.Add("r4:" + val.ToString());
                        pos += 5;
                    }
                    else pos = il.Length;
                    break;
                case 0x23: // ldc.r8
                    if (pos + 8 < il.Length)
                    {
                        double val = BitConverter.ToDouble(il, pos + 1);
                        constants.Add("r8:" + val.ToString());
                        pos += 9;
                    }
                    else pos = il.Length;
                    break;

                // call/callvirt/newobj
                case 0x28: // call
                case 0x6F: // callvirt
                case 0x73: // newobj
                    if (pos + 4 < il.Length)
                    {
                        int token = BitConverter.ToInt32(il, pos + 1);
                        string opName = op == 0x28 ? "call" : op == 0x6F ? "callvirt" : "newobj";
                        string resolved = ResolveToken(reader, token);
                        calls.Add(opName + " " + resolved);
                        pos += 5;
                    }
                    else pos = il.Length;
                    break;

                // ldstr
                case 0x72: // ldstr
                    if (pos + 4 < il.Length)
                    {
                        int token = BitConverter.ToInt32(il, pos + 1);
                        try
                        {
                            var handle = (StringHandle)MetadataTokens.Handle(token & 0x00FFFFFF);
                            string strVal = reader.GetString(handle);
                            strings.Add(strVal);
                        }
                        catch
                        {
                            strings.Add("(token 0x" + token.ToString("X8") + ")");
                        }
                        pos += 5;
                    }
                    else pos = il.Length;
                    break;

                // ldfld / ldsfld / stfld / stsfld
                case 0x7B: // ldfld
                case 0x7C: // ldflda
                case 0x7D: // stfld
                case 0x7E: // ldsfld
                case 0x7F: // ldsflda
                case 0x80: // stsfld
                    pos += 5; break;

                // Two-byte opcodes
                case 0xFE:
                    if (pos + 1 < il.Length)
                    {
                        byte op2 = il[pos + 1];
                        // Most FE opcodes are 2-byte + operand
                        if (op2 == 0x09) // ldarg
                        {
                            pos += 4; // FE 09 + ushort
                        }
                        else if (op2 == 0x0E) // ldarga
                        {
                            pos += 4;
                        }
                        else if (op2 == 0x0B) // stloc
                        {
                            pos += 4;
                        }
                        else if (op2 == 0x0C) // ldloc
                        {
                            pos += 4;
                        }
                        else if (op2 == 0x04) // ceq
                        {
                            pos += 2;
                        }
                        else if (op2 == 0x01) // conv.u2
                        {
                            pos += 2;
                        }
                        else if (op2 == 0x05) // cgt
                        {
                            pos += 2;
                        }
                        else if (op2 == 0x02) // conv.u4
                        {
                            pos += 2;
                        }
                        else if (op2 == 0x06) // clt
                        {
                            pos += 2;
                        }
                        else
                        {
                            pos += 2; // unknown 2-byte opcode
                        }
                    }
                    else pos = il.Length;
                    break;

                // Short branches (br.s, brtrue.s, brfalse.s, etc) — 2 bytes
                case 0x0D: case 0x2B: case 0x2C: case 0x2D: case 0x2E: case 0x2F:
                case 0x30: case 0x31: case 0x32: case 0x33: case 0x34: case 0x35:
                case 0x36: case 0x37: case 0x38: case 0x39: case 0x3A: case 0x3B:
                case 0x3C: case 0x3D: case 0x3E: case 0x3F:
                    pos += 2; break;

                // Long branches (br, brtrue, brfalse, etc) — 5 bytes
                case 0x42: case 0x43: case 0x44:
                    pos += 5; break;

                // Switch
                case 0x45: // switch
                    if (pos + 4 < il.Length)
                    {
                        int count = BitConverter.ToInt32(il, pos + 1);
                        pos += 5 + count * 4;
                    }
                    else pos = il.Length;
                    break;

                // Normal skip for single-byte opcodes without operands
                default:
                    // Most opcodes are 1 byte or have known operand sizes
                    // Simple heuristic: skip single byte
                    pos++;
                    break;
            }
        }
    }

    static string ResolveToken(MetadataReader reader, int token)
    {
        int table = token >> 24;
        int row = token & 0x00FFFFFF;

        try
        {
            switch (table)
            {
                case 0x06: // Method
                    var methodDef = reader.GetMethodDefinition(MetadataTokens.MethodDefinitionHandle(row));
                    string mName = reader.GetString(methodDef.Name);
                    // Try to get declaring type
                    var declaringType = methodDef.GetDeclaringType();
                    if (!declaringType.IsNil)
                    {
                        var tDef = reader.GetTypeDefinition(declaringType);
                        string tName = reader.GetString(tDef.Name);
                        return tName + "." + mName;
                    }
                    return mName;

                case 0x0A: // MemberRef
                    var memberRef = reader.GetMemberReference((MemberReferenceHandle)MetadataTokens.Handle(token));
                    string mrName = reader.GetString(memberRef.Name);
                    try
                    {
                        var parent = memberRef.Parent;
                        if (parent.Kind == HandleKind.TypeReference)
                        {
                            var tr = reader.GetTypeReference((TypeReferenceHandle)parent);
                            string trName = reader.GetString(tr.Name);
                            string trNS = reader.GetString(tr.Namespace);
                            return (string.IsNullOrEmpty(trNS) ? "" : trNS + ".") + trName + "." + mrName;
                        }
                        else if (parent.Kind == HandleKind.TypeDefinition)
                        {
                            var td = reader.GetTypeDefinition((TypeDefinitionHandle)parent);
                            string tdName = reader.GetString(td.Name);
                            return tdName + "." + mrName;
                        }
                    }
                    catch { }
                    return mrName;

                case 0x04: // Field
                    var fieldDef = reader.GetFieldDefinition(MetadataTokens.FieldDefinitionHandle(row));
                    string fName = reader.GetString(fieldDef.Name);
                    var fDeclType = fieldDef.GetDeclaringType();
                    if (!fDeclType.IsNil)
                    {
                        var ftDef = reader.GetTypeDefinition(fDeclType);
                        string ftName = reader.GetString(ftDef.Name);
                        return ftName + "." + fName;
                    }
                    return fName;

                case 0x01: // TypeRef
                    var typeRef = reader.GetTypeReference((TypeReferenceHandle)MetadataTokens.Handle(token));
                    return reader.GetString(typeRef.Namespace) + "." + reader.GetString(typeRef.Name);

                case 0x02: // TypeDef
                    var typeDef = reader.GetTypeDefinition(MetadataTokens.TypeDefinitionHandle(row));
                    return reader.GetString(typeDef.Namespace) + "." + reader.GetString(typeDef.Name);

                default:
                    return "Table" + table.ToString("X2") + "_Row" + row;
            }
        }
        catch
        {
            return "token_0x" + token.ToString("X8");
        }
    }

    static void ScanCommandCodes(MetadataReader reader)
    {
        // Known GET command codes from USB testing
        int[] knownCodes = {
            0x0005, 0x000A, 0x000C, 0x000E, 0x001F,
            0x0030, 0x0032, 0x0034,
            0x0040, 0x0042, 0x0046,
            0x0050, 0x0052, 0x0054, 0x0056,
            0x0096,
            0x0100, 0x0102, 0x0104, 0x0106, 0x0108, 0x010A, 0x010C, 0x010E,
            0x0140, 0x0142, 0x0144, 0x0146, 0x0148, 0x014A, 0x014C, 0x014E,
            0x0154, 0x0156, 0x0158, 0x015A
        };

        var codeLocations = new Dictionary<int, List<string>>();

        foreach (var typeDefHandle in reader.TypeDefinitions)
        {
            var typeDef = reader.GetTypeDefinition(typeDefHandle);
            string typeName = reader.GetString(typeDef.Name);

            foreach (var methodHandle in typeDef.GetMethods())
            {
                var method = reader.GetMethodDefinition(methodHandle);
                string methodName = reader.GetString(method.Name);

                try
                {
                    var methodBody = reader.GetMethodBody(methodHandle);
                    if (methodBody == null) continue;

                    var ilReader = reader.GetBlobReader(methodBody);
                    byte[] ilBytes = new byte[ilReader.RemainingBytes];
                    ilReader.ReadBytes(ilBytes);

                    // Scan for ldc.i4 instructions with command-code-like values
                    int pos = 0;
                    while (pos < ilBytes.Length)
                    {
                        byte op = ilBytes[pos];
                        int value = int.MinValue;

                        if (op == 0x20 && pos + 4 < ilBytes.Length) // ldc.i4
                        {
                            value = BitConverter.ToInt32(ilBytes, pos + 1);
                            pos += 5;
                        }
                        else if (op == 0x1F && pos + 1 < ilBytes.Length) // ldc.i4.s
                        {
                            value = (sbyte)ilBytes[pos + 1];
                            pos += 2;
                        }
                        else
                        {
                            pos++;
                            continue;
                        }

                        // Check if value matches known command codes or is in command-code range
                        bool isKnown = false;
                        foreach (var kc in knownCodes)
                        {
                            if (value == kc) { isKnown = true; break; }
                        }

                        // Also check for potential SET codes (odd numbers near GET codes)
                        bool isPotentialSet = false;
                        foreach (var kc in knownCodes)
                        {
                            if (value == kc + 1 || value == kc - 1)
                            {
                                isPotentialSet = true;
                                break;
                            }
                        }

                        // Check 0x0100-0x0200 range (likely SET command area)
                        bool isInRange = (value >= 0x0100 && value <= 0x0200) ||
                                        (value >= 0x0001 && value <= 0x0097);

                        if (isKnown || isPotentialSet || isInRange)
                        {
                            string loc = typeName + "." + methodName + " -> 0x" + value.ToString("X4");
                            if (!codeLocations.ContainsKey(value))
                                codeLocations[value] = new List<string>();
                            codeLocations[value].Add(loc);
                        }
                    }
                }
                catch { }
            }
        }

        // Sort by code value and output
        var sortedCodes = new List<int>(codeLocations.Keys);
        sortedCodes.Sort();

        Log("\nCommand codes found in method IL:");
        foreach (var code in sortedCodes)
        {
            string label = "";
            int[] knownArr = knownCodes;
            foreach (var kc in knownArr)
            {
                if (code == kc) { label = " [KNOWN GET]"; break; }
                if (code == kc + 1) { label = " [RESPONSE for 0x" + kc.ToString("X4") + "]"; break; }
            }
            if (code >= 0x0100 && code <= 0x0200 && label == "")
            {
                // Check if it could be a SET code
                foreach (var kc in knownArr)
                {
                    if (code == kc - 1) { label = " [POSSIBLE SET for 0x" + kc.ToString("X4") + "]"; break; }
                }
            }

            Log("  0x" + code.ToString("X4") + label + ":");
            foreach (var loc in codeLocations[code])
            {
                Log("    " + loc);
            }
        }
    }

    static void ParseRawMetadata(byte[] pe, int bsjbOffset)
    {
        Log("\n=== Parsing raw .NET metadata from BSJB at 0x" + bsjbOffset.ToString("X8") + " ===");
        try
        {
            // BSJB header: 4 sig + 4 majorVersion + 4 minorVersion + 4 reserved + 4 versionLength + version + ...
            int verLen = BitConverter.ToInt32(pe, bsjbOffset + 12);
            string version = Encoding.ASCII.GetString(pe, bsjbOffset + 16, verLen).TrimEnd('\0');
            Log("  Metadata version: " + version);

            // After version string, aligned to 4 bytes
            int pos = bsjbOffset + 16 + verLen;
            pos = (pos + 3) & ~3;

            ushort flags = BitConverter.ToUInt16(pe, pos);
            pos += 2;
            ushort numStreams = BitConverter.ToUInt16(pe, pos);
            pos += 2;
            Log("  Flags: " + flags + " Streams: " + numStreams);

            for (int s = 0; s < numStreams && s < 10; s++)
            {
                int sOffset = BitConverter.ToInt32(pe, pos);
                int sSize = BitConverter.ToInt32(pe, pos + 4);
                pos += 8;
                int nameEnd = pos;
                while (nameEnd < pe.Length && pe[nameEnd] != 0) nameEnd++;
                string sName = Encoding.ASCII.GetString(pe, pos, nameEnd - pos);
                Log("    Stream: \"" + sName + "\" offset=" + sOffset + " size=" + sSize);
                nameEnd++;
                nameEnd = (nameEnd + 3) & ~3;
                pos = nameEnd;

                // If this is #Strings, dump command-related strings
                if (sName == "#Strings")
                {
                    int stringsStart = bsjbOffset + sOffset;
                    Log("    #Strings heap at file offset 0x" + stringsStart.ToString("X8"));
                    DumpStringsHeap(pe, stringsStart, sSize);
                }

                // If this is #~, dump type/method tables
                if (sName == "#~")
                {
                    int tablesStart = bsjbOffset + sOffset;
                    Log("    #~ (tables) heap at file offset 0x" + tablesStart.ToString("X8"));
                }
            }
        }
        catch (Exception ex)
        {
            Log("  Raw metadata parse error: " + ex.Message);
        }
    }

    static void DumpStringsHeap(byte[] pe, int start, int size)
    {
        Log("    --- Command strings in #Strings heap ---");
        string[] kws = { "SET_", "GET_", "WRITE", "READ", "COMMAND", "FLASH",
                         "CUSTOMER", "COUNTRY", "TOOL_SN", "RUN_ID", "DEVICE_TIME",
                         "BATTERY", "FIRMWARE", "DEPTH", "DISTRICT", "CONFIG",
                         "AMPLIFIER", "SELF_TEST", "HOUSING", "LDAP", "UNIQUE" };

        int end = start + size;
        int pos = start;
        while (pos < end)
        {
            if (pe[pos] >= 0x20 && pe[pos] < 0x7F)
            {
                int len = 0;
                while (pos + len < end && pe[pos + len] >= 0x20 && pe[pos + len] < 0x7F) len++;
                if (len >= 5)
                {
                    string s = Encoding.ASCII.GetString(pe, pos, len);
                    foreach (var kw in kws)
                    {
                        if (s.IndexOf(kw, StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            Log("      [" + (pos - start) + "] " + s);
                            break;
                        }
                    }
                }
                pos += len;
            }
            else
            {
                pos++;
            }
        }
    }
}
