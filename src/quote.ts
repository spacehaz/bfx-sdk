import type { i128 } from "./math/abdk/types";
import { add, sub } from "./math/abdk/abdk";
import { toNumeraire, toRaw } from "./math/assimilator";
import { calculateTrade } from "./math/curveMath";
import { ONE } from "./constants";
import type { PoolState, QuoteResult, Address } from "./types";

export function quote(pool: PoolState, tokenIn: Address, tokenOut: Address, amountIn: bigint): QuoteResult {
  const tIn  = tokenIn.toLowerCase() as Address;
  const tOut = tokenOut.toLowerCase() as Address;

  if (tIn === tOut) throw new Error("tokenIn and tokenOut must be different");
  const inputIndex  = tIn === pool.tokenA.toLowerCase() ? 0 : 1;
  const outputIndex = tOut === pool.tokenA.toLowerCase() ? 0 : 1;

  const inputRate  = inputIndex === 0 ? pool.tokenAOraclePrice : pool.tokenBOraclePrice;
  const outputRate = inputIndex === 0 ? pool.tokenBOraclePrice : pool.tokenAOraclePrice;
  const inputDec   = inputIndex === 0 ? pool.tokenADecimals : pool.tokenBDecimals;
  const outputDec  = inputIndex === 0 ? pool.tokenBDecimals : pool.tokenADecimals;

  const inputNumeraire = toNumeraire(amountIn, inputRate, pool.oracleDecimals, inputDec);

  const oBals: i128[] = [
    toNumeraire(pool.reserveA, pool.tokenAOraclePrice, pool.oracleDecimals, pool.tokenADecimals),
    toNumeraire(pool.reserveB, pool.tokenBOraclePrice, pool.oracleDecimals, pool.tokenBDecimals),
  ];
  const oGLiq = oBals[0] + oBals[1];

  const nBals: i128[] = [...oBals];
  nBals[inputIndex]  = add(nBals[inputIndex], inputNumeraire);
  nBals[outputIndex] = sub(nBals[outputIndex], inputNumeraire); // initial 1:1 guess
  const nGLiq = oGLiq; // oGLiq + inputNumeraire - inputNumeraire cancels out

  const outputNumeraire = calculateTrade(
    oGLiq, nGLiq,
    oBals, nBals,
    inputNumeraire, outputIndex,
    pool.params,
  );

  // Apply fixed swap fee (epsilon) via unsafe mul — matches us_mul in Swaps.sol.
  // No bounds check needed: epsilon is tiny (<1%) so result always fits in i128.
  const feeAdjusted = (outputNumeraire * (ONE - pool.params.epsilon)) >> 64n;

  // outputNumeraire is negative (tokens leaving pool), negate before converting back.
  const amountOut          = toRaw(-feeAdjusted, outputRate, pool.oracleDecimals, outputDec);
  const amountOutBeforeFee = toRaw(-outputNumeraire, outputRate, pool.oracleDecimals, outputDec);
  const fee = amountOutBeforeFee - amountOut;

  // Effective price: output tokens per 1 input token, scaled by 1e18 for precision.
  const effectivePrice = (amountOut * 10n ** 18n) / amountIn;

  // Oracle reference: what a zero-slippage trade would yield at spot rates.
  const oracleOut = (amountIn * inputRate * 10n ** BigInt(outputDec))
                  / (outputRate * 10n ** BigInt(inputDec));

  const priceImpactBps = Number((oracleOut - amountOut) * 10_000n / oracleOut);

  return {
    amountOut,
    priceImpactBps,
    effectivePrice,
    fee,
    hops: [{ tokenIn: tIn, tokenOut: tOut, amountIn, amountOut, fee }],
  };
}
