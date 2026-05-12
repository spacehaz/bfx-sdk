import { describe, it, expect, beforeAll, afterAll, type TestContext } from "vitest";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { BFX } from "../src/pool/BFX";
import { CURVE_ABI } from "../src/abi/curve";

const RPC_URL = process.env.BASE_RPC_URL;
if (!RPC_URL) throw new Error("BASE_RPC_URL env variable is not set");

const POOL_ADDRESS = "0x671366075cc7b3b611de9ecf856e44587a11f303" as const;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const EURC = "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42" as const;

const client = createPublicClient({ chain: base, transport: http(RPC_URL) });

async function viewOriginSwap(tokenIn: `0x${string}`, tokenOut: `0x${string}`, amountIn: bigint): Promise<bigint> {
  return client.readContract({
    address: POOL_ADDRESS,
    abi: CURVE_ABI,
    functionName: "viewOriginSwap",
    args: [tokenIn, tokenOut, amountIn],
  });
}

describe("quote() matches viewOriginSwap() on-chain", () => {
  let pool: BFX;

  beforeAll(async () => {
    pool = await BFX.create(POOL_ADDRESS, RPC_URL);
  }, 30_000);

  afterAll(() => pool.stop());

  const usdcAmounts = [
    BigInt("100000"),    // 0.1 USDC
    500_000n,            // 0.5 USDC
    BigInt("1000000"),   //   1 USDC
    1_500_000n,          // 1.5 USDC
    BigInt("5000000"),   //   5 USDC
    10_000_000n,         //  10 USDC
    BigInt("20000000"),  //  20 USDC
    100_000_000n,        // 100 USDC
    1_000_000_000n,      // 1,000 USDC
    10_000_000_000n,     // 10,000 USDC
  ];

  const eurcAmounts = [
    BigInt("100000"),    // 0.1 EURC
    500_000n,            // 0.5 EURC
    BigInt("1000000"),   //   1 EURC
    1_500_000n,          // 1.5 EURC
    BigInt("5000000"),   //   5 EURC
    10_000_000n,         //  10 EURC
    BigInt("20000000"),  //  20 EURC
    100_000_000n,        // 100 EURC
    1_000_000_000n,      // 1,000 EURC
  ];

  const fmt = (amount: bigint) => (Number(amount) / 1_000_000).toString();

  async function assertQuote(ctx: TestContext, tokenIn: `0x${string}`, tokenOut: `0x${string}`, amountIn: bigint) {
    let onchain: bigint;

    const chainStart = performance.now();
    try {
      onchain = await viewOriginSwap(tokenIn, tokenOut, amountIn);
    } catch (err: any) {
      const reason = err?.data?.args?.[0] ?? err?.details ?? String(err);
      ctx.skip(`pool reverted: ${reason}`);
    }
    const chainMs = (performance.now() - chainStart).toFixed(0);

    const sdkStart = performance.now();
    const result = pool.quote(tokenIn, tokenOut, amountIn);
    const sdkMs = (performance.now() - sdkStart).toFixed(2);

    console.log(`    ${fmt(amountIn)} → ${fmt(result.amountOut)} | sdk: ${sdkMs}ms | chain: ${chainMs}ms`);

    expect(result.amountOut).toBe(onchain!);
  }

  for (const amountIn of usdcAmounts) {
    it(`USDC → EURC: ${fmt(amountIn)} USDC`, (ctx) => assertQuote(ctx, USDC, EURC, amountIn));
  }

  for (const amountIn of eurcAmounts) {
    it(`EURC → USDC: ${fmt(amountIn)} EURC`, (ctx) => assertQuote(ctx, EURC, USDC, amountIn));
  }
});
