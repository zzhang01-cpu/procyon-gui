#!/usr/bin/env python3
"""
Procyon CM Raw Binary Record Analyzer
Usage: python3 analyze_records.py <path_to_bin_file>

This script analyzes the raw binary dump from Procyon CM device
to find correct record boundaries and verify parsing.
"""

import struct
import sys
import os

# Record sizes from RecordFormatFiles.json (v2.1+)
REC_SIZES = {
    0x01: -1,    # FirmwareVersion: variable
    0x02: 5,     # Reset
    0x0D: 2,     # FlashDeviceID
    0x0E: 3,     # FlashBadBlockList
    0x1F: 2,     # UsbConnection
    0x80: 3,     # RpmAxialWaveform (csv_chain)
    0x81: 5,     # GyroTagDataCorrupt
    0x82: 5,     # StickSlip
    0x90: 7,     # AccelWaveform (csv_chain)
    0x91: 7,     # LowShockWaveform (csv_chain)
    0xA0: 81,    # OneSecondData (csv_chain)
    0xB0: 9,     # ParameterErrorHardware (csv_chain)
    0xB1: 6,     # ParameterErrorCrc
    0xB2: 2,     # ParameterErrorRangeCheck
    0xB3: 1,     # BufferedEventOverflow
    0xB4: 1,     # BufferedEventError
    0xD0: 1,     # DebugEvent0
    0xD1: 9,     # PhoenixOneSecondData (csv_chain)
    0xFE: 1,     # LoggingSystemError
    0xFF: 1,     # Flush
}

KNOWN_TYPES = set(REC_SIZES.keys())

def parse_one_second(buf, offset):
    """Parse a 0xA0 OneSecondData record at the given offset."""
    if offset + 81 > len(buf):
        return None
    
    off = offset + 1  # skip type byte
    temperature = struct.unpack_from('<h', buf, off)[0] * 0.03125; off += 2
    batteryV = struct.unpack_from('<h', buf, off)[0] * 0.001027; off += 2
    
    # RPM (12 × s16, scale=0.02333)
    rpm = []
    for _ in range(12):
        rpm.append(struct.unpack_from('<h', buf, off)[0] * 0.02333); off += 2
    
    # LowShock (12 × s16, scale=0.000244)
    shockLow = []
    for _ in range(12):
        shockLow.append(struct.unpack_from('<h', buf, off)[0] * 0.000244); off += 2
    
    # HighShock (14 × s16, scale=0.2)
    shockHigh = []
    for _ in range(14):
        shockHigh.append(struct.unpack_from('<h', buf, off)[0] * 0.2); off += 2
    
    return {
        'temperature': temperature,
        'batteryV': batteryV,
        'rpm': rpm,
        'shockLow': shockLow,
        'shockHigh': shockHigh,
    }

def find_a0_signatures(buf):
    """Find all byte positions where 0xA0 is followed by a valid temperature."""
    candidates = []
    for i in range(len(buf) - 81):
        if buf[i] == 0xA0:
            temp_raw = struct.unpack_from('<h', buf, i + 1)[0]
            temp_val = temp_raw * 0.03125
            if -40 <= temp_val <= 150:
                batt_raw = struct.unpack_from('<h', buf, i + 3)[0]
                batt_val = batt_raw * 0.001027
                candidates.append((i, temp_val, batt_val))
    return candidates

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 analyze_records.py <path_to_bin_file>")
        print("  Analyzes Procyon CM raw binary dump to find record boundaries")
        sys.exit(1)
    
    filepath = sys.argv[1]
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        sys.exit(1)
    
    with open(filepath, 'rb') as f:
        buf = f.read()
    
    print(f"File: {filepath}")
    print(f"Size: {len(buf)} bytes ({len(buf)/1024/1024:.1f} MB)")
    
    # Print first 128 bytes as hex
    print(f"\nFirst 128 bytes:")
    for row in range(8):
        offset = row * 16
        hex_str = ' '.join(f'{buf[offset+j]:02x}' for j in range(16))
        ascii_str = ''.join(chr(buf[offset+j]) if 32 <= buf[offset+j] < 127 else '.' for j in range(16))
        print(f"  {offset:6d}: {hex_str}  {ascii_str}")
    
    # Find all 0xA0 signatures with valid temperature
    print(f"\n=== Searching for valid 0xA0 OneSecondData records ===")
    candidates = find_a0_signatures(buf)
    print(f"Found {len(candidates)} candidate 0xA0 positions with valid temperature")
    
    if candidates:
        # Show first 20
        print("\nFirst 20 candidates:")
        for idx, (pos, temp, batt) in enumerate(candidates[:20]):
            print(f"  Offset {pos} (0x{pos:06x}): temp={temp:.4f}°C, batt={batt:.4f}V")
        
        # Show temperature distribution
        temps = [c[1] for c in candidates]
        batts = [c[2] for c in candidates]
        print(f"\nTemperature range: {min(temps):.2f} ~ {max(temps):.2f}°C")
        print(f"Battery range: {min(batts):.2f} ~ {max(batts):.2f}V")
    
    # Try sequential parsing from offset 0
    print(f"\n=== Sequential parse from offset 0 ===")
    i = 0
    counts = {}
    a0_records = []
    d1_records = []
    resyncs = 0
    
    while i < len(buf):
        # Skip 0xFF padding
        if buf[i] == 0xFF:
            start = i
            while i < len(buf) and buf[i] == 0xFF:
                i += 1
            counts[0xFF] = counts.get(0xFF, 0) + (i - start)
            continue
        
        rec_type = buf[i]
        counts[rec_type] = counts.get(rec_type, 0) + 1
        
        if rec_type == 0xA0:
            if i + 81 <= len(buf):
                rec = parse_one_second(buf, i)
                if rec and -40 <= rec['temperature'] <= 150:
                    a0_records.append((i, rec))
                    i += 81
                else:
                    # Invalid temperature, scan for next valid 0xA0
                    resyncs += 1
                    found = False
                    for scan in range(i + 1, min(i + 200, len(buf) - 81)):
                        if buf[scan] == 0xA0:
                            test_rec = parse_one_second(buf, scan)
                            if test_rec and -40 <= test_rec['temperature'] <= 150:
                                i = scan
                                found = True
                                break
                    if not found:
                        i += 1
            else:
                i += 1
        
        elif rec_type == 0xD1:
            if i + 9 <= len(buf):
                off = i + 1
                psi_min = struct.unpack_from('<h', buf, off)[0]; off += 2
                psi_max = struct.unpack_from('<h', buf, off)[0]; off += 2
                psi_avg = struct.unpack_from('<h', buf, off)[0]; off += 2
                temp_avg = struct.unpack_from('<h', buf, off)[0] * 0.03125; off += 2
                d1_records.append((i, psi_min, psi_max, psi_avg, temp_avg))
                i += 9
            else:
                i += 1
        
        elif rec_type == 0x01:
            # Variable size: scan for next known type
            j = i + 1
            while j < len(buf) and j < i + 50:
                if buf[j] in KNOWN_TYPES and buf[j] != 0x01:
                    break
                j += 1
            i = j
        
        elif rec_type in REC_SIZES:
            sz = REC_SIZES[rec_type]
            if sz > 0:
                i += sz
            else:
                i += 1
        else:
            i += 1
    
    print(f"Record type counts: {', '.join(f'0x{k:02x}={v}' for k, v in sorted(counts.items())})")
    print(f"A0 OneSecondData: {len(a0_records)} records (resyncs: {resyncs})")
    print(f"D1 PhoenixOneSecondData: {len(d1_records)} records")
    
    if a0_records:
        print(f"\nFirst 5 A0 records:")
        for idx, (pos, rec) in enumerate(a0_records[:5]):
            print(f"  Offset {pos}: temp={rec['temperature']:.4f}°C, batt={rec['batteryV']:.4f}V")
            print(f"    RPM: {['%.2f' % v for v in rec['rpm']]}")
            print(f"    LowShock: {['%.6f' % v for v in rec['shockLow']]}")
            print(f"    HighShock: {['%.2f' % v for v in rec['shockHigh']]}")
        
        if len(a0_records) > 5:
            print(f"\nLast 3 A0 records:")
            for idx, (pos, rec) in enumerate(a0_records[-3:]):
                print(f"  Offset {pos}: temp={rec['temperature']:.4f}°C, batt={rec['batteryV']:.4f}V")
    
    if d1_records:
        print(f"\nFirst 5 D1 records:")
        for idx, (pos, pmin, pmax, pavg, tavg) in enumerate(d1_records[:5]):
            print(f"  Offset {pos}: psiMin={pmin}, psiMax={pmax}, psiAvg={pavg}, tempAvg={tavg:.4f}°C")

    # Also try: find the distance between consecutive valid A0 positions
    if len(candidates) > 1:
        print(f"\n=== Consecutive 0xA0 spacing analysis ===")
        spacings = {}
        valid_seq = []
        for idx in range(1, min(len(candidates), 200)):
            dist = candidates[idx][0] - candidates[idx-1][0]
            spacings[dist] = spacings.get(dist, 0) + 1
        
        for dist, count in sorted(spacings.items(), key=lambda x: -x[1])[:10]:
            print(f"  Spacing {dist} bytes: {count} occurrences")
        
        # Check if 81 is a common spacing
        if 81 in spacings:
            print(f"\n  ✅ Spacing of 81 bytes (correct A0 size) found {spacings[81]} times!")
        
        # Find sequences of consistent 81-byte spacing
        seq_len = 1
        max_seq = 1
        max_seq_start = 0
        for idx in range(1, len(candidates)):
            if candidates[idx][0] - candidates[idx-1][0] == 81:
                seq_len += 1
                if seq_len > max_seq:
                    max_seq = seq_len
                    max_seq_start = idx - seq_len + 1
            else:
                seq_len = 1
        
        print(f"\n  Longest consecutive 81-byte chain: {max_seq} records starting at offset {candidates[max_seq_start][0]}")

if __name__ == '__main__':
    main()
