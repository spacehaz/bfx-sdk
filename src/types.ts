import type { i128 } from "./math/abdk/types";

export type Address = `0x${string}`;

export type CurveParams = {
  alpha: i128;
  beta: i128;
  delta: i128;
  epsilon: i128;
  lambda: i128;
  weights: i128[];
};

export type PoolState = {
  curveAddress: Address;
  tokenA: Address;        // always USDC
  tokenB: Address;        // FX stablecoin (EURC, CADC, etc.)
  tokenADecimals: number;
  tokenBDecimals: number;
  reserveA: bigint;       // raw token units for tokenA
  reserveB: bigint;       // raw token units for tokenB
  tokenAOraclePrice: bigint; // Chainlink price of tokenA (USDC) in USD
  tokenBOraclePrice: bigint; // Chainlink price of tokenB (FX stablecoin) in USD
  oracleDecimals: number;    // decimals for both oracles (Chainlink USD feeds always use 8)
  params: CurveParams;
  blockNumber: bigint;
};

export type QuoteResult = {
  amountOut: bigint;
  priceImpactBps: number;
  effectivePrice: bigint;
  fee: bigint;
};

export type TransactionRequest = {
  to: Address;
  data: `0x${string}`;
  value: bigint;
};

export type PoolInfo = {
  address: Address;
  token0: { address: Address; symbol: string };
  token1: { address: Address; symbol: string };
};
