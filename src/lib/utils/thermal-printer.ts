'use client';

/**
 * Sends ESC/POS bytes to a counter thermal printer over Web Serial or Web
 * Bluetooth.
 *
 * The bytes come from `domain/escpos`; this file is only transport. It exists
 * because the two APIs have nothing in common beyond "hand me a Uint8Array", and
 * because both of them have a hard rule that decides the whole design:
 *
 * **The connection must be opened from a user gesture.** `requestPort` and
 * `requestDevice` throw unless they are called directly from a click. So a
 * printer is paired once, by tapping "Connect printer", and the handle is kept
 * in module scope for the rest of the session. Automatic printing on accept
 * works only *after* that pairing, and the UI says so rather than silently
 * failing on the first order of the morning.
 *
 * Nothing here is available over plain HTTP or in a non-Chromium browser, which
 * is why every entry point is capability-checked and the print-preview modal
 * remains the fallback.
 */

import type { PaperWidth } from '@/lib/domain/escpos';

/**
 * Minimal structural types for Web Serial and Web Bluetooth.
 *
 * Declared here rather than pulled from `@types/w3c-web-serial` and
 * `@types/web-bluetooth`: two dependencies to describe four methods is not a
 * trade worth making, and these shapes are stable.
 */
type SerialPortLike = {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readonly writable: WritableStream<Uint8Array> | null;
};

type SerialLike = {
  requestPort(): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
};

type BluetoothCharacteristicLike = {
  writeValue(value: BufferSource): Promise<void>;
};

type BluetoothDeviceLike = {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{
      getPrimaryService(service: string): Promise<{
        getCharacteristic(characteristic: string): Promise<BluetoothCharacteristicLike>;
      }>;
    }>;
    disconnect(): void;
  };
};

type BluetoothLike = {
  requestDevice(options: {
    filters?: { services: string[] }[];
    optionalServices?: string[];
    acceptAllDevices?: boolean;
  }): Promise<BluetoothDeviceLike>;
};

/**
 * The de-facto standard serial-over-GATT service on cheap ESC/POS printers.
 * Nearly every 58 mm Bluetooth printer sold in this market exposes it.
 */
const PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const PRINTER_CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

/** BLE writes are capped well below a full ticket, so the buffer is chunked. */
const BLE_CHUNK_BYTES = 100;

export type PrinterKind = 'serial' | 'bluetooth';

export type ConnectedPrinter = {
  kind: PrinterKind;
  label: string;
};

type SerialConnection = { kind: 'serial'; port: SerialPortLike };
type BluetoothConnection = { kind: 'bluetooth'; device: BluetoothDeviceLike; characteristic: BluetoothCharacteristicLike };

let connection: SerialConnection | BluetoothConnection | null = null;

function serialApi(): SerialLike | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { serial?: SerialLike }).serial ?? null;
}

function bluetoothApi(): BluetoothLike | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { bluetooth?: BluetoothLike }).bluetooth ?? null;
}

export function printerSupport(): { serial: boolean; bluetooth: boolean } {
  return { serial: serialApi() != null, bluetooth: bluetoothApi() != null };
}

export function connectedPrinter(): ConnectedPrinter | null {
  if (!connection) return null;
  return connection.kind === 'serial'
    ? { kind: 'serial', label: 'USB / serial printer' }
    : { kind: 'bluetooth', label: connection.device.name ?? 'Bluetooth printer' };
}

/** Must be called from a click handler — the browser enforces it. */
export async function connectSerialPrinter(): Promise<ConnectedPrinter> {
  const serial = serialApi();
  if (!serial) throw new Error('This browser cannot talk to a USB printer. Use Chrome or Edge on a laptop.');

  const port = await serial.requestPort();
  // 9600 is the factory default on essentially all of these printers. A wrong
  // baud rate prints pages of garbage rather than failing, so it is not guessed.
  await port.open({ baudRate: 9600 });

  connection = { kind: 'serial', port };
  return { kind: 'serial', label: 'USB / serial printer' };
}

/** Must be called from a click handler — the browser enforces it. */
export async function connectBluetoothPrinter(): Promise<ConnectedPrinter> {
  const bluetooth = bluetoothApi();
  if (!bluetooth) {
    throw new Error('This browser cannot talk to a Bluetooth printer. Use Chrome on Android.');
  }

  const device = await bluetooth.requestDevice({
    filters: [{ services: [PRINTER_SERVICE_UUID] }],
    optionalServices: [PRINTER_SERVICE_UUID],
  });

  const gatt = device.gatt;
  if (!gatt) throw new Error('That device does not expose a printer service.');

  const server = await gatt.connect();
  const service = await server.getPrimaryService(PRINTER_SERVICE_UUID);
  const characteristic = await service.getCharacteristic(PRINTER_CHARACTERISTIC_UUID);

  connection = { kind: 'bluetooth', device, characteristic };
  return { kind: 'bluetooth', label: device.name ?? 'Bluetooth printer' };
}

export async function disconnectPrinter(): Promise<void> {
  if (!connection) return;
  try {
    if (connection.kind === 'serial') await connection.port.close();
    else connection.device.gatt?.disconnect();
  } catch {
    // Unplugged mid-service is the normal case, not an error worth surfacing.
  }
  connection = null;
}

/**
 * Writes a prepared ESC/POS buffer to the connected printer.
 *
 * Throws with a message meant to be shown to a merchant, not logged — the person
 * who sees this is standing at a counter wondering why no slip came out.
 */
export async function printBytes(bytes: Uint8Array): Promise<void> {
  if (!connection) throw new Error('No printer connected. Tap "Connect printer" first.');

  if (connection.kind === 'serial') {
    const writable = connection.port.writable;
    if (!writable) throw new Error('The printer connection was closed. Reconnect and try again.');

    const writer = writable.getWriter();
    try {
      await writer.write(bytes);
    } finally {
      // Without this the port stays locked and the next slip never prints.
      writer.releaseLock();
    }
    return;
  }

  // BLE: split into MTU-sized writes. Sent in order, never in parallel — these
  // printers have a small buffer and interleaved writes come out shuffled.
  for (let offset = 0; offset < bytes.length; offset += BLE_CHUNK_BYTES) {
    await connection.characteristic.writeValue(bytes.slice(offset, offset + BLE_CHUNK_BYTES));
  }
}

const PAPER_STORAGE_KEY = 'takeaway_printer_columns';
const AUTOPRINT_STORAGE_KEY = 'takeaway_printer_autoprint';

/** Paper width, remembered per device. 58 mm paper is by far the more common. */
export function getPaperWidth(): PaperWidth {
  if (typeof window === 'undefined') return 32;
  return localStorage.getItem(PAPER_STORAGE_KEY) === '48' ? 48 : 32;
}

export function setPaperWidth(columns: PaperWidth): void {
  localStorage.setItem(PAPER_STORAGE_KEY, String(columns));
}

/** Whether accepting an order should print a slip without another tap. */
export function getAutoPrint(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(AUTOPRINT_STORAGE_KEY) === 'true';
}

export function setAutoPrint(enabled: boolean): void {
  localStorage.setItem(AUTOPRINT_STORAGE_KEY, String(enabled));
}
