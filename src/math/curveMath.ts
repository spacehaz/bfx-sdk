import type { i128 } from "./abdk/types";
import { mul, div, add } from "./abdk/abdk";
import type { CurveParams } from "../types";
import { ONE, MAX_FEE, MIN_UTILITY_DIFF } from "../constants";

// Fee contribution from a single token being outside its ideal balance range.
// The pool defines a fee-free zone around each token's ideal balance (ideal * beta).
// Outside that zone, fee grows quadratically with distance from the threshold.
function calculateMicroFee(bal: i128, ideal: i128, beta: i128, delta: i128): i128 {
  if (bal < ideal) {
    const threshold = mul(ideal, ONE - beta);
    if (bal < threshold) {
      const feeMargin = threshold - bal;
      let fee = div(mul(feeMargin, delta), ideal);
      if (fee > MAX_FEE) fee = MAX_FEE;
      return mul(fee, feeMargin);
    }
  } else {
    const threshold = mul(ideal, ONE + beta);
    if (bal > threshold) {
      const feeMargin = bal - threshold;
      let fee = div(mul(feeMargin, delta), ideal);
      if (fee > MAX_FEE) fee = MAX_FEE;
      return mul(fee, feeMargin);
    }
  }
  return 0n;
}

// Sum of micro fees across all tokens — measures total pool imbalance.
// Called twice per trade iteration: once for old state (omega), once for new (psi).
export function calculateFee(
  gLiq: i128,
  bals: i128[],
  beta: i128,
  delta: i128,
  weights: i128[],
): i128 {
  let psi = 0n;
  for (let i = 0; i < bals.length; i++) {
    const ideal = mul(gLiq, weights[i]);
    psi += calculateMicroFee(bals[i], ideal, beta, delta);
  }
  return psi;
}

// Checks that pool utility (gLiq - fee) didn't decrease meaningfully after the swap.
// Allows tiny rounding dust (MIN_UTILITY_DIFF) but rejects any real utility loss.
function enforceSwapInvariant(oGLiq: i128, omega: i128, nGLiq: i128, psi: i128): void {
  const diff = (nGLiq - psi) - (oGLiq - omega);
  if (!(diff > 0n || diff >= MIN_UTILITY_DIFF))
    throw new Error("Curve/swap-invariant-violation");
}

// Checks each token stays within alpha boundaries after the swap.
// If new balance crosses a halt, it's only allowed if old balance was already past it
// and the trade moved it closer, not further.
function enforceHalts(
  oGLiq: i128, nGLiq: i128,
  oBals: i128[], nBals: i128[],
  weights: i128[], alpha: i128,
): void {
  for (let i = 0; i < nBals.length; i++) {
    const nIdeal = mul(nGLiq, weights[i]);

    if (nBals[i] > nIdeal) {
      const nHalt = mul(nIdeal, ONE + alpha);
      if (nBals[i] > nHalt) {
        const oHalt = mul(mul(oGLiq, weights[i]), ONE + alpha);
        if (oBals[i] < oHalt) throw new Error("Curve/upper-halt-1");
        if (nBals[i] - nHalt > oBals[i] - oHalt) throw new Error("Curve/upper-halt-2");
      }
    } else {
      const nHalt = mul(nIdeal, ONE - alpha);
      if (nBals[i] < nHalt) {
        const oHalt = mul(mul(oGLiq, weights[i]), ONE - alpha);
        if (oBals[i] > oHalt) throw new Error("Curve/lower-halt");
        if (nHalt - nBals[i] > oHalt - oBals[i]) throw new Error("Curve/lower-halt");
      }
    }
  }
}

// Iteratively finds the output amount where fees are self-consistent.
// Converges in ~3-5 iterations (max 32). The output is negative (tokens leaving pool).
// Convergence is checked by comparing values truncated to 1e13 precision (~1e-9 real).
export function calculateTrade(
  oGLiq: i128, nGLiq: i128,
  oBals: i128[], nBals: i128[],
  inputAmt: i128, outputIndex: number,
  params: CurveParams,
): i128 {
  const { alpha, beta, delta, lambda, weights } = params;
  const omega = calculateFee(oGLiq, oBals, beta, delta, weights);
  let outputAmt: i128 = -inputAmt;
  let psi: i128 = 0n;

  for (let i = 0; i < 32; i++) {
    psi = calculateFee(nGLiq, nBals, beta, delta, weights);
    const prevAmount = outputAmt;

    outputAmt = omega < psi
      ? -(inputAmt + omega - psi)
      : -(inputAmt + mul(lambda, omega - psi));

    if (outputAmt / 10_000_000_000_000n === prevAmount / 10_000_000_000_000n) {
      nGLiq = oGLiq + inputAmt + outputAmt;
      nBals[outputIndex] = oBals[outputIndex] + outputAmt;
      enforceHalts(oGLiq, nGLiq, oBals, nBals, weights, alpha);
      enforceSwapInvariant(oGLiq, omega, nGLiq, psi);
      return outputAmt;
    }

    nGLiq = oGLiq + inputAmt + outputAmt;
    nBals[outputIndex] = add(oBals[outputIndex], outputAmt);
  }

  throw new Error("Curve/swap-convergence-failed");
}
