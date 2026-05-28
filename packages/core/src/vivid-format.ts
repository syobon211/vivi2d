const MAGIC = new Uint8Array([0x56, 0x49, 0x56, 0x44]); // "VIVD"
const FORMAT_VERSION = 1;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const HEADER_LENGTH = 4 + 1 + SALT_LENGTH + IV_LENGTH; // 33 bytes

const MAX_DECODE_SIZE = 256 * 1024 * 1024;
const PBKDF2_ITERATIONS = 600_000;

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encodeVivid(
  viviJson: string,
  password: string,
): Promise<ArrayBuffer> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);

  const enc = new TextEncoder();
  const plaintext = enc.encode(viviJson);

  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  const result = new Uint8Array(HEADER_LENGTH + ciphertext.byteLength);
  result.set(MAGIC, 0);
  result[4] = FORMAT_VERSION;
  result.set(salt, 5);
  result.set(iv, 5 + SALT_LENGTH);
  result.set(new Uint8Array(ciphertext), HEADER_LENGTH);

  return result.buffer;
}

export async function decodeVivid(data: ArrayBuffer, password: string): Promise<string> {
  const bytes = new Uint8Array(data);

  if (bytes.length < HEADER_LENGTH) {
    throw new Error(".vivid file is too small");
  }

  if (bytes.length > MAX_DECODE_SIZE) {
    throw new Error(
      `.vivid file is too large (${(bytes.length / 1024 / 1024).toFixed(1)}MB, max ${MAX_DECODE_SIZE / 1024 / 1024}MB)`,
    );
  }

  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) {
    throw new Error("Invalid .vivid file");
    }
  }

  const version = bytes[4];
  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported .vivid version: ${version}`);
  }

  const salt = bytes.slice(5, 5 + SALT_LENGTH);
  const iv = bytes.slice(5 + SALT_LENGTH, HEADER_LENGTH);
  const ciphertext = bytes.slice(HEADER_LENGTH);

  const key = await deriveKey(password, salt);

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
    const dec = new TextDecoder();
    return dec.decode(plaintext);
  } catch {
    throw new Error("Incorrect password");
  }
}

export function isVividFormat(data: ArrayBuffer): boolean {
  const bytes = new Uint8Array(data);
  if (bytes.length < MAGIC.length) return false;
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) return false;
  }
  return true;
}
