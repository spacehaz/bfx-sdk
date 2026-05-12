# bfx-sdk

TypeScript SDK for the BFX Protocol — a USDC-paired FX stablecoin AMM deployed on Base. Enables DEX aggregators (ParaSwap, KyberSwap, 0x, etc.) to quote and execute swaps off-chain without per-quote RPC calls.

## Context

Every pool is `USDC ↔ FX_STABLECOIN` (e.g. EURC/USDC). The SDK covers a single pool leg — multi-hop routing (e.g. EURC→CADC via USDC) is the aggregator's responsibility.

## What the SDK does

1. Load pool state (reserves, curve params, oracle prices) from chain once, then keep it fresh via event subscriptions
2. Quote off-chain: given `amountIn`, compute `amountOut` using ported curve math — no RPC call, runs in <1ms
3. Build calldata for on-chain swap execution

## Package structure

```
src/
├── math/
│   ├── abdk/
│   │   ├── types.ts       # i128 type alias (bigint)
│   │   ├── constants.ts   # MIN_64x64, MAX_64x64, ONE
│   │   └── abdk.ts        # Port of ABDKMath64x64 (fromUInt, mul, div, etc.)
│   ├── curveMath.ts       # calculateTrade + calculateFee — Shell Protocol bonding curve
│   └── assimilator.ts     # token ↔ numeraire conversion via Chainlink oracle price
│
├── pool/
│   ├── BFX.ts             # Main class — create(), quote(), buildSwap(), stop()
│   ├── fetchState.ts      # Reads pool state from chain (3 rounds of Promise.all)
│   ├── interface.ts       # IBFX interface
│   └── index.ts           # Re-exports
│
├── abi/
│   ├── curve.ts           # viewCurve, reserves, assimilator, Trade event, viewOriginSwap, originSwap
│   ├── assimilator.ts     # getRate, oracleDecimals, oracle
│   ├── erc20.ts           # decimals, balanceOf
│   └── oracle.ts          # AnswerUpdated event
│
├── constants.ts           # ONE, MAX_FEE, MIN_UTILITY_DIFF
├── types.ts               # PoolState, CurveParams, QuoteResult, TransactionRequest
├── quote.ts               # Pure quote function (used internally by BFX class)
├── swap.ts                # buildSwap function (used internally by BFX class)
└── index.ts               # Public exports
```

## Public API

```ts
import { BFX } from "bfx-sdk";

// Create a pool instance — fetches state from chain, subscribes to events
const pool = await BFX.create(curveAddress: Address, rpcUrl: string): Promise<BFX>

// Off-chain quote — <1ms, no RPC call
pool.quote(tokenIn: Address, tokenOut: Address, amountIn: bigint): QuoteResult

// Build unsigned swap calldata
pool.buildSwap(params: Omit<BuildSwapParams, "curveAddress">): TransactionRequest

// Read current pool state snapshot
pool.getState(): PoolState

// Unsubscribe from chain events — call when done
pool.stop(): void
```

## Key types

```ts
type PoolState = {
  curveAddress: Address
  tokenA: Address          // always USDC
  tokenB: Address          // FX stablecoin (EURC, CADC, etc.)
  tokenADecimals: number
  tokenBDecimals: number
  reserveA: bigint         // raw token units
  reserveB: bigint
  tokenAOraclePrice: bigint  // Chainlink price of tokenA (USDC) in USD, 8 decimals
  tokenBOraclePrice: bigint  // Chainlink price of tokenB (FX stablecoin) in USD, 8 decimals
  oracleDecimals: number
  params: CurveParams
  blockNumber: bigint
}

type CurveParams = {
  alpha: i128    // max/min reserve allocation boundaries (64x64 fixed-point)
  beta: i128     // liquidity depth around oracle price
  delta: i128    // slippage outside beta region
  epsilon: i128  // fixed swap fee
  lambda: i128   // dynamic fee (constrained to 1e18 in V3)
  weights: i128[] // always [0.5, 0.5] — DFX pools are 50/50 by design
}

type QuoteResult = {
  amountOut: bigint
  priceImpactBps: number
  effectivePrice: bigint  // output per 1 input, scaled by 1e18
  fee: bigint
}
```

## Critical constraint: math must be bit-exact

`quote()` must return the same `amountOut` as `viewOriginSwap()` on-chain. Any divergence causes aggregator reverts or bad routing.

The math chain: `assimilator.ts` normalises raw token amounts to USD numeraire using Chainlink prices → `curveMath.ts` runs the Shell Protocol convergence loop → result is converted back to raw token units.

All math uses `bigint` — no floating point anywhere in the math path.

## Event subscriptions (pub/sub)

`BFX.create()` subscribes to two event types via `watchContractEvent`:
- `AnswerUpdated` on both Chainlink oracles → updates `tokenAOraclePrice` / `tokenBOraclePrice`
- `Trade` on the Curve contract → re-fetches `reserveA` / `reserveB` via `balanceOf`

Call `pool.stop()` to unsubscribe. Failing to call it leaks polling connections.

## Tests

```bash
npm test               # run once
npm test -- --reporter=verbose  # show per-test exchange rates and timings
```

Tests in `tests/quote.test.ts` compare `pool.quote()` against live `viewOriginSwap()` calls on Base mainnet. Requires `BASE_RPC_URL` in `.env`.

## Tech stack

- TypeScript 5, strict mode
- viem for all chain reads and event subscriptions
- BigInt throughout — no floating point in math paths
- tsup for build (CJS + ESM + types)
- vitest for tests
