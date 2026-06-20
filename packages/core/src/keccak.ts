/**
 * Minimal pure-TypeScript Keccak-256 (the original Keccak, NOT NIST SHA3-256).
 *
 * EIP-55 Ethereum address checksums use Keccak-256, which uses the original
 * Keccak padding (`0x01` … `0x80`). NIST SHA3-256 uses a different padding
 * (`0x06` … `0x80`) and produces a different digest, so node's built-in
 * `createHash("sha3-256")` cannot be used here. Faithful port of the reference
 * `src/entviz/keccak.py` (and the Rust port's `src/keccak.rs`), cross-checked
 * against their known-answer vectors.
 *
 * Lanes are 64-bit, so the state is held as BigInt (JS numbers are only 53-bit
 * exact). Keccak only runs during EIP-55 validation of a 40-char address — a
 * single 136-byte block — so BigInt's cost is irrelevant.
 */

const MASK64 = (1n << 64n) - 1n;

const RC: bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

// Rho rotation offsets, indexed ROT[y][x].
const ROT: number[][] = [
  [0, 1, 62, 28, 27],
  [36, 44, 6, 55, 20],
  [3, 10, 43, 25, 39],
  [41, 45, 15, 21, 8],
  [18, 2, 61, 56, 14],
];

function rotl64(x: bigint, n: number): bigint {
  const r = BigInt(n & 63);
  if (r === 0n) return x & MASK64;
  return ((x << r) | (x >> (64n - r))) & MASK64;
}

// state[x][y]; the explicit x/y lane indices mirror the Keccak-f[1600] spec
// (Bertoni et al.) — rewriting them as array methods would obscure the modular
// index arithmetic and invite transcription bugs in a crypto kernel.
function keccakF1600(state: bigint[][]): void {
  for (const rc of RC) {
    // Theta
    const c = new Array<bigint>(5);
    for (let x = 0; x < 5; x++) {
      c[x] = state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4];
    }
    const d = new Array<bigint>(5);
    for (let x = 0; x < 5; x++) {
      d[x] = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) state[x][y] ^= d[x];
    }

    // Rho + Pi
    const b: bigint[][] = [
      [0n, 0n, 0n, 0n, 0n],
      [0n, 0n, 0n, 0n, 0n],
      [0n, 0n, 0n, 0n, 0n],
      [0n, 0n, 0n, 0n, 0n],
      [0n, 0n, 0n, 0n, 0n],
    ];
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        b[y][(2 * x + 3 * y) % 5] = rotl64(state[x][y], ROT[y][x]);
      }
    }

    // Chi
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        state[x][y] = b[x][y] ^ ((~b[(x + 1) % 5][y] & MASK64) & b[(x + 2) % 5][y]);
      }
    }

    // Iota
    state[0][0] ^= rc;
  }
}

function absorbBlock(state: bigint[][], block: Uint8Array): void {
  for (let i = 0; i < block.length; i++) {
    const laneIndex = Math.floor(i / 8);
    const x = laneIndex % 5;
    const y = Math.floor(laneIndex / 5);
    const byteInLane = i % 8;
    state[x][y] ^= (BigInt(block[i]) << BigInt(8 * byteInLane)) & MASK64;
  }
}

/** The 32-byte Keccak-256 digest of `data`. */
export function keccak256(data: Uint8Array): Buffer {
  const RATE = 136;
  const state: bigint[][] = [
    [0n, 0n, 0n, 0n, 0n],
    [0n, 0n, 0n, 0n, 0n],
    [0n, 0n, 0n, 0n, 0n],
    [0n, 0n, 0n, 0n, 0n],
    [0n, 0n, 0n, 0n, 0n],
  ];

  let offset = 0;
  const len = data.length;
  while (len - offset >= RATE) {
    absorbBlock(state, data.subarray(offset, offset + RATE));
    keccakF1600(state);
    offset += RATE;
  }

  // Final block: 0x01 … 0x80 padding.
  const last = new Uint8Array(RATE);
  last.set(data.subarray(offset));
  last[len - offset] = 0x01;
  last[RATE - 1] |= 0x80;
  absorbBlock(state, last);
  keccakF1600(state);

  const out = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    const laneIndex = Math.floor(i / 8);
    const x = laneIndex % 5;
    const y = Math.floor(laneIndex / 5);
    const byteInLane = i % 8;
    out[i] = Number((state[x][y] >> BigInt(8 * byteInLane)) & 0xffn);
  }
  return out;
}

/** Lowercase hex of the Keccak-256 digest. */
export function keccak256Hex(data: Uint8Array): string {
  return keccak256(data).toString("hex");
}
