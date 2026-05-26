export type OSCArgType = "i" | "f" | "s" | "b";

export type OSCArg =
  | { type: "i"; value: number }
  | { type: "f"; value: number }
  | { type: "s"; value: string }
  | { type: "b"; value: Uint8Array };

export interface OSCMessage {
  address: string;
  args: OSCArg[];
}

function readOSCString(
  buf: DataView,
  offset: number,
): { value: string; nextOffset: number } {
  let end = offset;
  while (end < buf.byteLength && buf.getUint8(end) !== 0) {
    end++;
  }
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset + offset, end - offset);
  const value = new TextDecoder().decode(bytes);
  const padded = end + 1;
  const nextOffset = padded + ((4 - (padded % 4)) % 4);
  return { value, nextOffset };
}

export function parseOSCMessage(buffer: ArrayBuffer): OSCMessage | null {
  try {
    const view = new DataView(buffer);
    let offset = 0;

    const addr = readOSCString(view, offset);
    if (!addr.value.startsWith("/")) return null;
    offset = addr.nextOffset;

    const typeTag = readOSCString(view, offset);
    offset = typeTag.nextOffset;

    const tags = typeTag.value.startsWith(",") ? typeTag.value.slice(1) : typeTag.value;
    const args: OSCArg[] = [];

    for (const tag of tags) {
      switch (tag) {
        case "i": {
          const value = view.getInt32(offset, false); // big-endian
          args.push({ type: "i", value });
          offset += 4;
          break;
        }
        case "f": {
          const value = view.getFloat32(offset, false);
          args.push({ type: "f", value });
          offset += 4;
          break;
        }
        case "s": {
          const str = readOSCString(view, offset);
          args.push({ type: "s", value: str.value });
          offset = str.nextOffset;
          break;
        }
        case "b": {
          const size = view.getInt32(offset, false);
          offset += 4;
          const value = new Uint8Array(buffer, offset, size);
          args.push({ type: "b", value });
          const padded = size + ((4 - (size % 4)) % 4);
          offset += padded;
          break;
        }
        default:
          break;
      }
    }

    return { address: addr.value, args };
  } catch {
    return null;
  }
}

function writeOSCString(str: string): Uint8Array {
  const encoded = new TextEncoder().encode(str);
  const totalLen = encoded.length + 1;
  const padded = totalLen + ((4 - (totalLen % 4)) % 4);
  const buf = new Uint8Array(padded);
  buf.set(encoded, 0);
  return buf;
}

export function serializeOSCMessage(msg: OSCMessage): ArrayBuffer {
  const parts: Uint8Array[] = [];

  parts.push(writeOSCString(msg.address));

  const tags = `,${msg.args.map((a) => a.type).join("")}`;
  parts.push(writeOSCString(tags));

  for (const arg of msg.args) {
    switch (arg.type) {
      case "i": {
        const buf = new ArrayBuffer(4);
        new DataView(buf).setInt32(0, arg.value, false);
        parts.push(new Uint8Array(buf));
        break;
      }
      case "f": {
        const buf = new ArrayBuffer(4);
        new DataView(buf).setFloat32(0, arg.value, false);
        parts.push(new Uint8Array(buf));
        break;
      }
      case "s":
        parts.push(writeOSCString(arg.value));
        break;
      case "b": {
        const sizeBuf = new ArrayBuffer(4);
        new DataView(sizeBuf).setInt32(0, arg.value.length, false);
        parts.push(new Uint8Array(sizeBuf));
        const padded = arg.value.length + ((4 - (arg.value.length % 4)) % 4);
        const blobBuf = new Uint8Array(padded);
        blobBuf.set(arg.value, 0);
        parts.push(blobBuf);
        break;
      }
    }
  }

  const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result.buffer;
}

export interface VMCFaceChannelValue {
  name: string;
  value: number;
}

export interface VMCBoneTransform {
  name: string;
  posX: number;
  posY: number;
  posZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  rotW: number;
}

export function parseVMCFaceChannel(msg: OSCMessage): VMCFaceChannelValue | null {
  if (msg.address !== "/VMC/Ext/Blend/Val") return null;
  if (msg.args.length < 2) return null;
  const nameArg = msg.args[0] as OSCArg;
  const valueArg = msg.args[1] as OSCArg;
  if (nameArg.type !== "s" || valueArg.type !== "f") return null;
  return { name: nameArg.value, value: valueArg.value };
}

export function parseVMCBonePos(msg: OSCMessage): VMCBoneTransform | null {
  if (msg.address !== "/VMC/Ext/Bone/Pos") return null;
  if (msg.args.length < 8) return null;
  const nameArg = msg.args[0] as OSCArg;
  const px = msg.args[1] as OSCArg;
  const py = msg.args[2] as OSCArg;
  const pz = msg.args[3] as OSCArg;
  const rx = msg.args[4] as OSCArg;
  const ry = msg.args[5] as OSCArg;
  const rz = msg.args[6] as OSCArg;
  const rw = msg.args[7] as OSCArg;
  if (nameArg.type !== "s") return null;
  return {
    name: nameArg.value,
    posX: px.type === "f" ? px.value : 0,
    posY: py.type === "f" ? py.value : 0,
    posZ: pz.type === "f" ? pz.value : 0,
    rotX: rx.type === "f" ? rx.value : 0,
    rotY: ry.type === "f" ? ry.value : 0,
    rotZ: rz.type === "f" ? rz.value : 0,
    rotW: rw.type === "f" ? rw.value : 0,
  };
}
