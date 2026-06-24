/**
 * Tiny isomorphic byte/encoding helpers — the Node-free replacements for the
 * Buffer encodings the renderer used to lean on, so @entviz/core runs unchanged
 * in a browser (it backs @entviz/react). TextEncoder is built into both Node and
 * browsers; hex and base64url here are plain deterministic transforms
 * (encodings, NOT crypto), pinned bit-for-bit against Node's prior Buffer output
 * by bytes.test.ts and by the golden SVG fixtures / conformance corpus.
 */
const UTF8 = new TextEncoder();

/** UTF-8 encode a string to bytes. */
export function utf8Bytes(s: string): Uint8Array {
  return UTF8.encode(s);
}

/** UTF-8 byte length of a string (counts bytes, not UTF-16 code units). */
export function utf8ByteLength(s: string): number {
  return UTF8.encode(s).length;
}

const HEX_CHARS = "0123456789abcdef";

/** Lowercase hex of a byte array (matches Buffer.toString("hex")). */
export function bytesToHex(u8: Uint8Array): string {
  let out = "";
  for (let i = 0; i < u8.length; i++) {
    out += HEX_CHARS[u8[i] >> 4] + HEX_CHARS[u8[i] & 0x0f];
  }
  return out;
}

const B64URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * Unpadded base64url (RFC 4648 §5 alphabet, no `=` padding) — matches Node's
 * Buffer.toString("base64url").
 */
export function bytesToBase64url(u8: Uint8Array): string {
  let out = "";
  const len = u8.length;
  let i = 0;
  for (; i + 3 <= len; i += 3) {
    const n = (u8[i] << 16) | (u8[i + 1] << 8) | u8[i + 2];
    out +=
      B64URL[(n >> 18) & 63] +
      B64URL[(n >> 12) & 63] +
      B64URL[(n >> 6) & 63] +
      B64URL[n & 63];
  }
  const rem = len - i;
  if (rem === 1) {
    const n = u8[i] << 16;
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63];
  } else if (rem === 2) {
    const n = (u8[i] << 16) | (u8[i + 1] << 8);
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63] + B64URL[(n >> 6) & 63];
  }
  return out;
}
