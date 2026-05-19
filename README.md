# bfx-sdk

Off-chain quoting and swap building for BFX liquidity pools. Designed for DEX aggregators — compute quotes locally in microseconds without an RPC call, then build the swap transaction when ready.

Supports both single-hop swaps (USDC ↔ EURC) and multi-hop swaps (EURC ↔ XSGD via USDC). The SDK handles routing automatically — you only specify the tokens you want to trade.

## Installation

```bash
npm install bfx-sdk
```

## Usage

### Initialisation

```ts
import { BFX } from "bfx-sdk";

const bfx = new BFX("https://your-rpc-url.com");
```

### Discover pools

```ts
// all available pools
const pools = await bfx.getAllPoolsInfo();
// [
//   { address: "0x80ba...", token0: { address: "0x60a3...", symbol: "EURC" }, token1: { address: "0x8335...", symbol: "USDC" } },
//   { address: "0xbBb1...", token0: { address: "0x0a4c...", symbol: "XSGD" }, token1: { address: "0x8335...", symbol: "USDC" } },
// ]

// single pool by address
const pool = await bfx.getPoolInfo("0x80ba6376c0Ea9A14C1d4411C3639e87d441A6b72");

// single pool by token pair
const pool = await bfx.getPoolInfoByTokens(USDC, EURC);
```

### Load pool state

**Must be called before `quote()`, `buildSwap()`, or `getPoolState()`.**

Pass the two tokens you want to trade — the SDK figures out the routing automatically:

```ts
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const EURC = "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42";
const XSGD = "0xd3d31bc27e3f0b3f9d0f63f3feba50a8cfed5b63";

// Single-hop — loads one pool, returns one entry
const [eurcUsdc] = await bfx.loadPoolState(USDC, EURC);

// Multi-hop — loads two pools automatically, returns two entries
const [eurcUsdc, xsgdUsdc] = await bfx.loadPoolState(EURC, XSGD);
```

### Quote

```ts
// amounts are in raw token units (6 decimals for USDC/EURC/XSGD)
const result = bfx.quote(USDC, EURC, 1_000_000n); // 1 USDC → EURC

console.log(result.amountOut);     // how many EURC you receive (bigint)
console.log(result.fee);           // fee taken on the final leg (bigint)
console.log(result.priceImpactBps); // price impact in basis points
console.log(result.effectivePrice); // output per 1 input, scaled by 1e18
console.log(result.hops);          // breakdown per hop — one entry for single-hop, two for multi-hop
```

Multi-hop quote — identical call:

```ts
const result = bfx.quote(EURC, XSGD, 1_000_000n); // 1 EURC → XSGD
// result.hops[0] → { tokenIn: EURC, tokenOut: USDC, amountIn, amountOut, fee }
// result.hops[1] → { tokenIn: USDC, tokenOut: XSGD, amountIn, amountOut, fee }
```

### Build a swap transaction

```ts
const tx = bfx.buildSwap({
  tokenIn: USDC,
  tokenOut: EURC,
  amountIn: 1_000_000n,
  minAmountOut: 900_000n,                          // slippage tolerance
  recipient: "0xYourAddress",
  deadline: Math.floor(Date.now() / 1000) + 1200, // 20 min from now
});

// tx.to    — curve address (single-hop) or Router address (multi-hop)
// tx.data  — encoded originSwap() calldata
// tx.value — always 0n for token swaps

// wagmi
await sendTransaction({ to: tx.to, data: tx.data, value: tx.value });

// ethers
await signer.sendTransaction({ to: tx.to, data: tx.data, value: tx.value });
```

### Read live pool state

The state returned by `loadPoolState` is a one-time snapshot. To read the current state after events have updated it:

```ts
const state = bfx.getPoolState(USDC, EURC);
console.log(state.reserveA); // always reflects the latest on-chain state
```

### Cleanup

Call `stop()` to unsubscribe from all events when done:

```ts
bfx.stop();
```

## Amount format

All amounts use raw token units as `bigint`:

```ts
1_000_000n;  // 1 USDC or 1 EURC  (6 decimals)
10_000_000n; // 10 USDC or 10 EURC
```

To convert from a string or ethers `BigNumber`:

```ts
BigInt("1000000");
BigInt(ethBigNumber.toString());
```
