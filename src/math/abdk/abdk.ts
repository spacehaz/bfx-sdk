import type { i128 } from "./types";
import { MIN_64x64, MAX_64x64 } from "./constants";

// Encode a plain unsigned integer as 64x64.
// e.g. fromUInt(1n) === ONE (18446744073709551616n)
// Max input: 2^63 - 1 — the integer part is stored in the upper 64 bits of a
// signed 128-bit value, so it can hold at most a signed 64-bit range.

// fromUInt(1) → 1 * 2^64 = 18446744073709551616  (means 1.0)
// fromUInt(5) → 5 * 2^64                          (means 5.0)

export function fromUInt(x: bigint): i128 {
  if (x < 0n || x > 0x7FFFFFFFFFFFFFFFn) throw new Error("fromUInt: overflow");
  return x << 64n;
}

// Encode a signed integer as 64x64.
// fromInt(-1n) → -1 * 2^64 (means -1.0)
// BigInt << on negatives works correctly: -1n << 64n === -18446744073709551616n
export function fromInt(x: bigint): i128 {
  if (x < -0x8000000000000000n || x > 0x7FFFFFFFFFFFFFFFn)
    throw new Error("fromInt: overflow");
  return x << 64n;
}

// Decode 64x64 → signed integer, truncating toward -∞.
// toInt(fromInt(3n))  === 3n
// toInt(fromInt(-3n)) === -3n
// Fractional part is dropped: toInt(1.75 encoded) === 1n
// BigInt >> is arithmetic shift — sign is preserved, so -1.5 → -2n (floors).
export function toInt(x: i128): bigint {
  return x >> 64n;
}

// Decode 64x64 → unsigned integer, truncating toward 0.
// Throws if x is negative — use this when the value must be a token amount.
// toUInt(fromUInt(5n)) === 5n
// toUInt(fromInt(-1n)) throws
export function toUInt(x: i128): bigint {
  if (x < 0n) throw new Error("toUInt: underflow");
  return x >> 64n;
}

// x + y. No scaling needed — fixed-point addition is just integer addition.
// add(fromUInt(3n), fromUInt(2n)) === fromUInt(5n)
export function add(x: i128, y: i128): i128 {
  const result = x + y;
  if (result < MIN_64x64 || result > MAX_64x64) throw new Error("add: overflow");
  return result;
}

// x - y. Same as add — no scaling, just integer subtraction.
// sub(fromUInt(5n), fromUInt(2n)) === fromUInt(3n)
// sub(fromUInt(1n), fromUInt(3n)) === fromInt(-2n)
export function sub(x: i128, y: i128): i128 {
  const result = x - y;
  if (result < MIN_64x64 || result > MAX_64x64) throw new Error("sub: overflow");
  return result;
}

// x * y → 64x64.
// Multiplying two 64x64 gives a 128x128 result (denominator 2^128).
// >> 64 divides out one 2^64 to restore the 64x64 denominator.
// mul(fromUInt(3n), fromUInt(2n)) === fromUInt(6n)
export function mul(x: i128, y: i128): i128 {
  const result = (x * y) >> 64n;
  if (result < MIN_64x64 || result > MAX_64x64) throw new Error("mul: overflow");
  return result;
}

// x / y → 64x64.
// Naive division would lose the denominator: (a/2^64) / (b/2^64) = a/b (plain integer).
// << 64 pre-multiplies the numerator to restore the 2^64 denominator in the result.
// div(fromUInt(6n), fromUInt(2n)) === fromUInt(3n)
export function div(x: i128, y: i128): i128 {
  if (y === 0n) throw new Error("div: division by zero");
  const result = (x << 64n) / y;
  if (result < MIN_64x64 || result > MAX_64x64) throw new Error("div: overflow");
  return result;
}

// x (64x64) * y (plain uint256) → plain uint256.
// Used in assimilator to denormalise: numeraire amount → raw token units.
// (a/2^64) * b = (a * b) / 2^64, so >> 64 to remove the fixed-point encoding.
// Solidity needs hi/lo split to avoid 256-bit overflow — BigInt handles it natively.
export function mulu(x: i128, y: bigint): bigint {
  if (y === 0n) return 0n;
  if (x < 0n) throw new Error("mulu: x must be non-negative");
  return (x * y) >> 64n;
}

// x (plain uint256) / y (plain uint256) → 64x64.
// Used in assimilator to normalise: raw token amount → numeraire fixed-point value.
// << 64 encodes the result as 64x64. Solidity needs ~40 lines for this due to
// 256-bit overflow on x << 64 — BigInt handles it natively.
export function divu(x: bigint, y: bigint): i128 {
  if (y === 0n) throw new Error("divu: division by zero");
  const result = (x << 64n) / y;
  if (result > MAX_64x64) throw new Error("divu: overflow");
  return result;
}
