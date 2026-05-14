# bfx-sdk

Off-chain quoting and swap building for BFX liquidity pools. Designed for DEX aggregators — compute quotes locally in microseconds without an RPC call, then build the swap transaction when ready.

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
//   { address: "0x671366...", token0: { address: "0x60a3...", symbol: "EURC" }, token1: { address: "0x8335...", symbol: "USDC" } },
//   { address: "0xf0c350...", token0: { address: "0x0a4c...", symbol: "XSGD" }, token1: { address: "0x8335...", symbol: "USDC" } },
// ]

// single pool by address
const pool = await bfx.getPoolInfo("0x671366075cc7b3b611de9ecf856e44587a11f303");
```

### Load pool state

**Must be called before `quote()`, `buildSwap()`, or `getState()`.**

Discovers the pool address by token pair, fetches on-chain reserves and curve parameters, and subscribes to events to keep state fresh as trades and oracle price updates occur.

```ts
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const EURC = "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42";

const { address, state } = await bfx.loadPoolState(USDC, EURC);
```

### Quote

```ts
// amounts are in raw token units (6 decimals for USDC/EURC)
const result = bfx.quote(USDC, EURC, 1_000_000n); // 1 USDC → EURC

console.log(result.amountOut); // how many EURC you receive (bigint)
console.log(result.fee); // fee taken (bigint)
console.log(result.priceImpactBps); // price impact in basis points
console.log(result.effectivePrice); // output per 1 input, scaled by 1e18
```

### Build a swap transaction

```ts
const tx = bfx.buildSwap({
  tokenIn: USDC,
  tokenOut: EURC,
  amountIn: 1_000_000n,
  minAmountOut: 900_000n, // slippage tolerance
  recipient: "0xYourAddress",
  deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 20), // 20 min
});

// tx.to    — contract address
// tx.data  — encoded originSwap() calldata
// tx.value — ETH to send alongside (0 for token swaps)

// wagmi
await sendTransaction({ to: tx.to, data: tx.data, value: tx.value });

// ethers
await signer.sendTransaction({ to: tx.to, data: tx.data, value: tx.value });
```

### Cleanup

Call `stop()` to unsubscribe from events when the pool is no longer needed:

```ts
bfx.stop();
```

## Amount format

All amounts use raw token units as `bigint`:

```ts
1_000_000n; // 1 USDC or 1 EURC  (6 decimals)
10_000_000n; // 10 USDC or 10 EURC
```

To convert from a string or ethers `BigNumber`:

```ts
BigInt("1000000");
BigInt(ethBigNumber.toString());
```
