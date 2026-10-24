import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { KEY_PATH, ensureDataDir } from "./paths";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  ensureDataDir();

  if (existsSync(KEY_PATH)) {
    const raw = readFileSync(KEY_PATH);
    if (raw.length !== 32) {
      throw new Error(
        `Encryption key at ${KEY_PATH} is invalid (expected 32 bytes).`,
      );
    }
    cachedKey = raw;
    return raw;
  }

  const key = randomBytes(32);
  writeFileSync(KEY_PATH, key, { mode: 0o600 });
  try {
    chmodSync(KEY_PATH, 0o600);
  } catch {
    // best effort on platforms without POSIX permissions
  }
  cachedKey = key;
  return key;
}

function b64url(buf: Buffer) {
  return buf.toString("base64url");
}

/**
 * Encrypts a JSON-serializable value with AES-256-GCM.
 * Format: v1.<iv>.<authTag>.<ciphertext> (base64url)
 */
export function encryptJson(value: unknown): string {
  if (value === undefined || value === null) return "";
  const json = JSON.stringify(value);
  if (!json || json === "{}") return "";

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(json, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return ["v1", b64url(iv), b64url(tag), b64url(ciphertext)].join(".");
}

export function decryptJson<T>(blob: string | null | undefined, fallback: T): T {
  if (!blob) return fallback;
  try {
    const [version, iv, tag, ciphertext] = blob.split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext) return fallback;

    const decipher = createDecipheriv(
      "aes-256-gcm",
      getKey(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plain) as T;
  } catch {
    return fallback;
  }
}

export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 6) return "•".repeat(value.length);
  return `${value.slice(0, 2)}${"•".repeat(Math.min(12, value.length - 4))}${value.slice(-2)}`;
}
