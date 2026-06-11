// Web USB API Type Definitions
// These types are not yet included in TypeScript's default lib

declare global {
  interface USBDevice {
    readonly vendorId: number;
    readonly productId: number;
    readonly manufacturerName?: string;
    readonly productName?: string;
    readonly serialNumber?: string;
    readonly opened: boolean;
    readonly configuration?: USBConfiguration;
    readonly configurations: USBConfiguration[];
    
    open(): Promise<void>;
    close(): Promise<void>;
    selectConfiguration(configurationValue: number): Promise<void>;
    claimInterface(interfaceNumber: number): Promise<void>;
    releaseInterface(interfaceNumber: number): Promise<void>;
    selectAlternateInterface(interfaceNumber: number, alternateSetting: number): Promise<void>;
    
    controlTransferIn(setup: USBControlTransferParameters, length: number): Promise<USBInTransferResult>;
    controlTransferOut(setup: USBControlTransferParameters, data?: BufferSource): Promise<USBOutTransferResult>;
    
    transferIn(endpointNumber: number, length: number): Promise<USBInTransferResult>;
    transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>;
    
    isochronousTransferIn(endpointNumber: number, packetLengths: number[]): Promise<USBIsochronousInTransferResult>;
    isochronousTransferOut(endpointNumber: number, data: BufferSource, packetLengths: number[]): Promise<USBIsochronousOutTransferResult>;
    
    reset(): Promise<void>;
    forget(): Promise<void>;
    
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  }

  interface USBConfiguration {
    readonly configurationValue: number;
    readonly configurationName?: string;
    readonly interfaces: USBInterface[];
  }

  interface USBInterface {
    readonly interfaceNumber: number;
    readonly alternates: USBAlternateInterface[];
  }

  interface USBAlternateInterface {
    readonly alternateSetting: number;
    readonly interfaceClass: number;
    readonly interfaceSubclass: number;
    readonly interfaceProtocol: number;
    readonly interfaceName?: string;
    readonly endpoints: USBEndpoint[];
  }

  interface USBEndpoint {
    readonly endpointNumber: number;
    readonly direction: 'in' | 'out';
    readonly type: 'bulk' | 'interrupt' | 'isochronous';
    readonly packetSize: number;
  }

  interface USBControlTransferParameters {
    requestType: 'standard' | 'class' | 'vendor';
    recipient: 'device' | 'interface' | 'endpoint' | 'other';
    request: number;
    value: number;
    index: number;
  }

  interface USBInTransferResult {
    readonly data?: DataView;
    readonly status: 'ok' | 'stall' | 'babble';
  }

  interface USBOutTransferResult {
    readonly bytesWritten: number;
    readonly status: 'ok' | 'stall';
  }

  interface USBIsochronousInTransferResult {
    readonly packets: USBIsochronousInTransferPacket[];
    readonly data?: DataView;
  }

  interface USBIsochronousInTransferPacket {
    readonly data?: DataView;
    readonly status: 'ok' | 'stall' | 'babble';
  }

  interface USBIsochronousOutTransferResult {
    readonly packets: USBIsochronousOutTransferPacket[];
  }

  interface USBIsochronousOutTransferPacket {
    readonly status: 'ok' | 'stall';
  }

  interface USBDeviceRequestOptions {
    filters: USBDeviceFilter[];
    exclusionFilters?: USBDeviceFilter[];
  }

  interface USBDeviceFilter {
    vendorId?: number;
    productId?: number;
    classCode?: number;
    subclassCode?: number;
    protocolCode?: number;
    serialNumber?: string;
  }

  interface USB extends EventTarget {
    getDevices(): Promise<USBDevice[]>;
    requestDevice(options: USBDeviceRequestOptions): Promise<USBDevice>;
    
    addEventListener(type: 'connect' | 'disconnect', listener: (event: USBConnectionEvent) => void): void;
    removeEventListener(type: 'connect' | 'disconnect', listener: (event: USBConnectionEvent) => void): void;
  }

  interface USBConnectionEvent extends Event {
    readonly device: USBDevice;
  }

  interface Navigator {
    readonly usb?: USB;
  }
}

export {};
