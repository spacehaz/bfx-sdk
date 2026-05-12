# bfx-sdk

Off-chain quoting and swap building for BFX liquidity pools. Designed for DEX aggregators — compute quotes locally in microseconds without an RPC call, then build the swap transaction when ready.

> **Note:** Currently only supports the USDC ↔ EURC pool on Base. Additional pools will be added as liquidity grows.

## Supported pools

| Pool        | Network |
| ----------- | ------- |
| USDC ↔ EURC | Base    |

## Installation

```bash
npm install bfx-sdk
```

## Usage

### Quote

```ts
import { BFX } from "bfx-sdk";

const pool = await BFX.create(
  "0x671366075cc7b3b611de9ecf856e44587a11f303", // pool address
  "https://your-rpc-url.com",
);

// amounts are in raw token units (6 decimals for USDC/EURC)
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const EURC = "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42";

const result = pool.quote(USDC, EURC, 1_000_000n); // 1 USDC

console.log(result.amountOut); // how many EURC you receive (bigint)
console.log(result.fee); // fee taken (bigint)
console.log(result.priceImpactBps); // price impact in basis points
console.log(result.effectivePrice); // output per 1 input, scaled by 1e18
```

### Build a swap transaction

```ts
const tx = pool.buildSwap({
  tokenIn: USDC,
  tokenOut: EURC,
  amountIn: 1_000_000n,
  minAmountOut: 900_000n, // slippage tolerance
  recipient: "0xYourAddress",
  deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 20), // 20 min
});

// tx.to   — contract address to call (the Curve pool)
// tx.data — encoded originSwap(...) call with all parameters packed into bytes
// tx.value — ETH to send alongside (0 for token swaps)

// pass directly to your wallet:

// wagmi
await sendTransaction({ to: tx.to, data: tx.data, value: tx.value });

// ethers
await signer.sendTransaction({ to: tx.to, data: tx.data, value: tx.value });
```

### Cleanup

The pool subscribes to on-chain events to keep its state fresh. Call `stop()` when done:

```ts
pool.stop();
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
