// Web Serial API Type Definitions
declare global {
  // Serial API types
  interface Navigator {
    serial: Serial;
  }

  interface Serial {
    getPorts(): Promise<SerialPort[]>;
    requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
    addEventListener(type: 'connect' | 'disconnect', listener: (event: SerialConnectionEvent) => void): void;
    removeEventListener(type: 'connect' | 'disconnect', listener: (event: SerialConnectionEvent) => void): void;
  }

  interface SerialPortRequestOptions {
    filters?: SerialPortFilter[];
  }

  interface SerialPortFilter {
    usbVendorId?: number;
    usbProductId?: number;
  }

  interface SerialConnectionEvent extends Event {
    readonly target: SerialPort;
    readonly port: SerialPort;
  }

  interface SerialPort {
    readonly readable: ReadableStream<Uint8Array> | null;
    readonly writable: WritableStream<Uint8Array> | null;
    getInfo(): SerialPortInfo;
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    setSignals(signals: SerialOutputSignals): Promise<void>;
    getSignals(): Promise<SerialInputSignals>;
    addEventListener(type: 'connect' | 'disconnect', listener: (event: SerialConnectionEvent) => void): void;
    removeEventListener(type: 'connect' | 'disconnect', listener: (event: SerialConnectionEvent) => void): void;
    forget(): Promise<void>;
  }

  interface SerialPortInfo {
    usbVendorId?: number;
    usbProductId?: number;
  }

  interface SerialOptions {
    baudRate: number;
    dataBits?: 5 | 6 | 7 | 8;
    stopBits?: 1 | 2;
    parity?: 'none' | 'even' | 'odd';
    flowControl?: 'none' | 'hardware';
    bufferSize?: number;
  }

  interface SerialOutputSignals {
    dataTerminalReady?: boolean;
    requestToSend?: boolean;
    break?: boolean;
  }

  interface SerialInputSignals {
    readonly dataCarrierDetect: boolean;
    readonly clearToSend: boolean;
    readonly ringIndicator: boolean;
    readonly dataSetReady: boolean;
    readonly dataTerminalReady: boolean;
    readonly requestToSend: boolean;
    readonly break: boolean;
  }
}

export {};
