# Changelog

All notable changes to this project will be documented in this file.

## [0.0.1] - 2026-05-20

### Added

- `BFX` class — main entry point, instantiated with an RPC URL
- `loadPoolState(tokenA, tokenB)` — discovers and loads pool state from chain
  - Single-hop: if one token is USDC, loads the direct pool
  - Multi-hop: if neither token is USDC, loads both USDC bridge pools in parallel
  - Returns an array of loaded pools (`{ address, state }[]`)
- `quote(tokenIn, tokenOut, amountIn)` — off-chain quote using ported curve math, no RPC call, runs in <1ms
  - Transparently handles single-hop and multi-hop via USDC
  - Returns `QuoteResult` with `amountOut`, `priceImpactBps`, `effectivePrice`, `fee`, and `hops[]`
- `buildSwap(params)` — builds unsigned swap calldata
  - Single-hop routes to the curve contract's `originSwap`
  - Multi-hop routes to the Router contract's `originSwap`
- `getPoolState(tokenA, tokenB)` — returns a live snapshot of the loaded pool state
- `getAllPoolsInfo()` — fetches all pools from the Goldsky GraphQL subgraph
- `getPoolInfo(address)` — fetches a single pool by contract address
- `getPoolInfoByTokens(tokenA, tokenB)` — fetches a pool by token pair
- `stop()` — unsubscribes from all chain event listeners

### Event subscriptions

- `AnswerUpdated` on Chainlink aggregator contracts — keeps oracle prices fresh
- `Trade` on Curve contracts — re-fetches reserves after each swap

### Math

- Port of ABDKMath64x64 fixed-point library to TypeScript (`bigint`-based, no floating point)
- Shell Protocol bonding curve (`calculateTrade`) with alpha, beta, delta, epsilon, lambda parameters
- Assimilator normalization — converts raw token amounts to USD numeraire via Chainlink oracle prices
- Bit-exact match against on-chain `viewOriginSwap` verified by tests

### Exports

- `BFX`, `IBFX` — main class and interface
- `quote`, `buildSingleHopSwap`, `buildMultiHopSwap` — pure functions for aggregator adapters
- `ROUTER_ADDRESS`, `USDC_ADDRESS` — protocol constants on Base
- Types: `Address`, `CurveParams`, `PoolInfo`, `PoolState`, `QuoteHop`, `QuoteResult`, `TransactionRequest`, `BuildSwapParams`
