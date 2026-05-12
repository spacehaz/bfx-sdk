import type { i128 } from "./abdk/types";
import { divu, mulu } from "./abdk/abdk";

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

// Convert a 64x64 numeraire back to a raw token amount. Inverse of toNumeraire.
// Scales up by 1e18 before dividing by rate to preserve precision — the 1e18
// in numerator and denominator cancel but protect against integer division loss.
// Uses ceilDiv so the protocol always receives at least the full numeraire value.
export function toRaw(
  numeraire: i128,
  rate: bigint,
  oracleDecimals: number,
  tokenDecimals: number,
): bigint {
  const scaled = mulu(numeraire, 10n ** BigInt(tokenDecimals + oracleDecimals + 18));
  return ceilDiv(scaled, rate * 10n ** 18n);
}

// Convert a raw token amount to a 64x64 numeraire (USD value).
// (rawAmount * rate) / 10^oracleDecimals removes oracle scaling,
// then divu by 10^tokenDecimals normalizes token units.
// Example: 1 EURC (1_000_000n) at 1.09 USD → divu(1_090_000, 1e6) = 1.09 as 64x64
export function toNumeraire(
  rawAmount: bigint,
  rate: bigint,
  oracleDecimals: number,
  tokenDecimals: number,
): i128 {
  const usdValue = (rawAmount * rate) / 10n ** BigInt(oracleDecimals);
  return divu(usdValue, 10n ** BigInt(tokenDecimals));
}
