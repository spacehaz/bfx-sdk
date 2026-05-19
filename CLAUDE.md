# bfx-sdk

TypeScript SDK for the BFX Protocol — a USDC-paired FX stablecoin AMM deployed on Base. Enables DEX aggregators (ParaSwap, KyberSwap, 0x, etc.) to quote and execute swaps off-chain without per-quote RPC calls.

## Context

Every pool is `USDC ↔ FX_STABLECOIN` (e.g. EURC/USDC, XSGD/USDC). The SDK handles both single-hop swaps (USDC ↔ EURC) and multi-hop swaps (EURC ↔ XSGD via USDC) transparently — the caller never specifies the route.

## What the SDK does

1. Discover pools via the Goldsky GraphQL subgraph (by token pair or address)
2. Load pool state (reserves, curve params, oracle prices) from chain, then keep it fresh via event subscriptions
3. Quote off-chain: given `amountIn`, compute `amountOut` using ported curve math — no RPC call, runs in <1ms
4. Build calldata for on-chain swap execution (single-hop targets the curve, multi-hop targets the Router)

## Package structure

```
src/
├── math/
│   ├── abdk/
│   │   ├── types.ts            # i128 type alias (bigint)
│   │   ├── constants.ts        # MIN_64x64, MAX_64x64, ONE
│   │   └── abdk.ts             # Port of ABDKMath64x64 (fromUInt, mul, div, etc.)
│   ├── curveMath.ts            # calculateTrade + calculateFee — Shell Protocol bonding curve
│   └── assimilator.ts          # token ↔ numeraire conversion via Chainlink oracle price
│
├── pool/
│   ├── BFX.ts                  # Main class — constructor, loadPoolState(), quote(), buildSwap(), stop()
│   ├── fetchState.ts           # Reads pool state from chain (4 rounds of Promise.all)
│   ├── graphql.ts              # Shared GraphQL URL, gql helper, RawPair type, toPair mapper
│   ├── fetchPoolByTokens.ts    # fetchPoolByTokens() + internal fetchPoolAddress()
│   ├── fetchPoolByAddress.ts   # fetchPoolByAddress()
│   ├── fetchAllPools.ts        # fetchAllPools()
│   ├── interface.ts            # IBFX interface
│   └── index.ts                # Re-exports
│
├── abi/
│   ├── curve.ts                # viewCurve, reserves, assimilator, Trade event, viewOriginSwap, originSwap
│   ├── assimilator.ts          # getRate, oracleDecimals, oracle
│   ├── erc20.ts                # decimals, balanceOf
│   ├── oracle.ts               # AnswerUpdated event, aggregator()
│   └── router.ts               # getCurve, originSwap (BFX Router)
│
├── constants.ts                # ONE, MAX_FEE, MIN_UTILITY_DIFF, ROUTER_ADDRESS, USDC_ADDRESS
├── types.ts                    # PoolState, CurveParams, QuoteResult, QuoteHop, TransactionRequest, PoolInfo
├── quote.ts                    # Pure quote function (used internally by BFX class)
├── swap.ts                     # buildSingleHopSwap, buildMultiHopSwap (used internally by BFX class)
└── index.ts                    # Public exports
```

## Public API

```ts
import { BFX } from "bfx-sdk";

// Instantiate — no async, no pool address needed
const bfx = new BFX(rpcUrl: string)

// Pool discovery (GraphQL, no chain calls)
bfx.getAllPoolsInfo(): Promise<PoolInfo[]>
bfx.getPoolInfo(address: Address): Promise<PoolInfo | null>
bfx.getPoolInfoByTokens(tokenA: Address, tokenB: Address): Promise<PoolInfo | null>

// Load pool state — MUST be called before quote(), buildSwap(), getPoolState()
// If tokenA or tokenB is USDC: loads one direct pool (single-hop)
// Otherwise: loads tokenA/USDC + tokenB/USDC pools in parallel (multi-hop)
bfx.loadPoolState(tokenA: Address, tokenB: Address): Promise<{ address: Address; state: PoolState }[]>

// Off-chain quote — <1ms, no RPC call
// Automatically single-hop or multi-hop based on loaded pools
bfx.quote(tokenIn: Address, tokenOut: Address, amountIn: bigint): QuoteResult

// Build unsigned swap calldata
// Single-hop → targets curve contract; multi-hop → targets Router contract
bfx.buildSwap(params: BuildSwapParams): TransactionRequest

// Read current pool state snapshot (live — reflects latest event updates)
bfx.getPoolState(tokenA: Address, tokenB: Address): PoolState

// Unsubscribe from chain events — call when done
bfx.stop(): void
```

## Key types

```ts
type PoolInfo = {
  address: Address
  token0: { address: Address; symbol: string }
  token1: { address: Address; symbol: string }
}

type PoolState = {
  curveAddress: Address
  tokenA: Address          // first token (order from chain)
  tokenB: Address          // second token (order from chain)
  tokenADecimals: number
  tokenBDecimals: number
  reserveA: bigint         // raw token units
  reserveB: bigint
  tokenAOraclePrice: bigint  // Chainlink price of tokenA in USD, 8 decimals
  tokenBOraclePrice: bigint  // Chainlink price of tokenB in USD, 8 decimals
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

type QuoteHop = {
  tokenIn: Address
  tokenOut: Address
  amountIn: bigint
  amountOut: bigint
  fee: bigint
}

type QuoteResult = {
  amountOut: bigint
  priceImpactBps: number
  effectivePrice: bigint  // output per 1 input, scaled by 1e18
  fee: bigint             // fee on the final leg, in output token units
  hops: QuoteHop[]        // one entry for single-hop, two for multi-hop
}

type BuildSwapParams = {
  tokenIn: Address
  tokenOut: Address
  amountIn: bigint
  minAmountOut: bigint
  recipient: Address
  deadline: number
}
```

## Critical constraint: math must be bit-exact

`quote()` must return the same `amountOut` as `viewOriginSwap()` on-chain. Any divergence causes aggregator reverts or bad routing.

The math chain: `assimilator.ts` normalises raw token amounts to USD numeraire using Chainlink prices → `curveMath.ts` runs the Shell Protocol convergence loop → result is converted back to raw token units.

All math uses `bigint` — no floating point anywhere in the math path.

## Routing logic

- **Single-hop**: one of the tokens is USDC → direct pool, `buildSwap` targets the curve's `originSwap`
- **Multi-hop**: neither token is USDC → two pools via USDC bridge, `buildSwap` targets the Router's `originSwap`
- Detection happens in `loadPoolState` and is re-derived in `quote()` / `buildSwap()` from the loaded pool map

## Event subscriptions (pub/sub)

`loadPoolState()` subscribes to two event types via `watchContractEvent` per loaded pool:
- `AnswerUpdated` on both Chainlink aggregators → updates `tokenAOraclePrice` / `tokenBOraclePrice`
- `Trade` on the Curve contract → re-fetches `reserveA` / `reserveB` via `balanceOf`

State returned by `loadPoolState` is a one-time snapshot. Use `getPoolState(tokenA, tokenB)` to read the live state after events update it.

Call `bfx.stop()` to unsubscribe all pools. Failing to call it leaks polling connections.

Note: `watchContractEvent` over HTTP requires a node that supports `eth_newFilter`. Public nodes that work: `https://mainnet.base.org`, `https://base.llamarpc.com`. `publicnode.com` does not support stateful filters.

## Tests

```bash
npm test               # run once
npm test -- --reporter=verbose  # show per-test exchange rates and timings
```

Tests in `tests/quote.test.ts` cover:
- `quote()` before `loadPoolState()` throws
- `getAllPoolsInfo()` returns a non-empty array
- `getPoolInfo()` by address
- `getPoolInfoByTokens()` by token pair
- `quote()` bit-exact match against live `viewOriginSwap()` on Base mainnet
- `hops` array is correctly populated for single-hop quotes

Requires `BASE_RPC_URL` in `.env`.

## Tech stack

- TypeScript 5, strict mode
- viem for all chain reads and event subscriptions
- BigInt throughout — no floating point in math paths
- tsup for build (CJS + ESM + types)
- vitest for tests
