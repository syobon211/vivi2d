export interface MidiMapping {
  channel?: number;

  cc: number;

  parameterId: string;

  min?: number;

  max?: number;
}

export type OnMidiInput = (values: Record<string, number>) => void;

export interface MidiDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
}

export class MidiController {
  private access: MIDIAccess | null = null;
  private mappings: MidiMapping[] = [];
  private callback: OnMidiInput | null = null;
  private boundOnMessage = this.onMessage.bind(this);
  private boundOnStateChange = this.onStateChange.bind(this);

  static isSupported(): boolean {
    return "requestMIDIAccess" in navigator;
  }

  async init(): Promise<void> {
    if (!MidiController.isSupported()) {
      throw new Error("Web MIDI API is not available");
    }
    this.access = await navigator.requestMIDIAccess();
  }

  getInputDevices(): MidiDeviceInfo[] {
    if (!this.access) return [];
    const devices: MidiDeviceInfo[] = [];
    for (const input of this.access.inputs.values()) {
      devices.push({
        id: input.id,
        name: input.name ?? `MIDI Input ${input.id}`,
        manufacturer: input.manufacturer ?? "",
      });
    }
    return devices;
  }

  setMappings(mappings: MidiMapping[]): void {
    this.mappings = mappings;
  }

  start(callback: OnMidiInput): void {
    if (!this.access) throw new Error("Call init() first");
    this.callback = callback;

    for (const input of this.access.inputs.values()) {
      input.addEventListener("midimessage", this.boundOnMessage);
    }

    this.access.addEventListener("statechange", this.boundOnStateChange);
  }

  stop(): void {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) {
      input.removeEventListener("midimessage", this.boundOnMessage);
    }
    this.access.removeEventListener("statechange", this.boundOnStateChange);
    this.callback = null;
  }

  destroy(): void {
    this.stop();
    this.access = null;
    this.mappings = [];
  }

  private onStateChange(): void {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) {
      input.removeEventListener("midimessage", this.boundOnMessage);
      input.addEventListener("midimessage", this.boundOnMessage);
    }
  }

  private onMessage(event: Event): void {
    const midiEvent = event as MIDIMessageEvent;
    const data = midiEvent.data;
    if (!data || data.length < 3) return;

    const status = data[0]!;
    const type = status & 0xf0;
    const channel = status & 0x0f;

    // Control Change (0xB0)
    if (type !== 0xb0) return;

    const cc = data[1]!;
    const rawValue = data[2]!; // 0-127

    if (!this.callback || this.mappings.length === 0) return;

    const values: Record<string, number> = {};
    for (const mapping of this.mappings) {
      if (mapping.cc !== cc) continue;
      if (mapping.channel !== undefined && mapping.channel !== channel) continue;

      const min = mapping.min ?? 0;
      const max = mapping.max ?? 1;
      const normalized = rawValue / 127;
      values[mapping.parameterId] = min + normalized * (max - min);
    }

    if (Object.keys(values).length > 0) {
      this.callback(values);
    }
  }
}

export function midiLearn(
  access: MIDIAccess,
  timeout = 10000,
): Promise<{ channel: number; cc: number } | null> {
  return new Promise((resolve) => {
    let resolved = false;
    const cleanup: (() => void)[] = [];

    const handler = (event: Event) => {
      if (resolved) return;
      const midiEvent = event as MIDIMessageEvent;
      const data = midiEvent.data;
      if (!data || data.length < 3) return;
      const status = data[0]!;
      if ((status & 0xf0) !== 0xb0) return;
      resolved = true;
      for (const fn of cleanup) fn();
      resolve({ channel: status & 0x0f, cc: data[1]! });
    };

    for (const input of access.inputs.values()) {
      input.addEventListener("midimessage", handler);
      cleanup.push(() => input.removeEventListener("midimessage", handler));
    }

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        for (const fn of cleanup) fn();
        resolve(null);
      }
    }, timeout);
  });
}
