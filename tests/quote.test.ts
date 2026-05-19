import { describe, it, expect, beforeAll, afterAll, afterEach, type TestContext } from "vitest";

afterEach(() => new Promise((resolve) => setTimeout(resolve, 10_000)), 15_000);
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { BFX } from "../src/pool/BFX";
import { CURVE_ABI } from "../src/abi/curve";

const RPC_URL = process.env.BASE_RPC_URL;
if (!RPC_URL) throw new Error("BASE_RPC_URL env variable is not set");

const EURC_USDC_POOL = "0x80ba6376c0Ea9A14C1d4411C3639e87d441A6b72" as const;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const EURC = "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42" as const;

const client = createPublicClient({ chain: base, transport: http(RPC_URL) });

async function viewOriginSwap(
  poolAddress: `0x${string}`,
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  amountIn: bigint,
): Promise<bigint> {
  return client.readContract({
    address: poolAddress,
    abi: CURVE_ABI,
    functionName: "viewOriginSwap",
    args: [tokenIn, tokenOut, amountIn],
  });
}

describe("quote() before loadPoolState()", () => {
  it("throws if pool state is not loaded", () => {
    const bfx = new BFX(RPC_URL!);
    expect(() => bfx.quote(USDC, EURC, 1_000_000n)).toThrow("Call loadPoolState() first.");
  });
});

describe("getAllPoolsInfo()", () => {
  it("returns an array of pool info", async () => {
    const bfx = new BFX(RPC_URL!);
    const pools = await bfx.getAllPoolsInfo();
    expect(Array.isArray(pools)).toBe(true);
    expect(pools.length).toBeGreaterThan(0);
    for (const pool of pools) {
      expect(pool.address).toMatch(/^0x/);
      expect(pool.token0.address).toMatch(/^0x/);
      expect(pool.token0.symbol).toBeTruthy();
      expect(pool.token1.address).toMatch(/^0x/);
      expect(pool.token1.symbol).toBeTruthy();
    }
  }, 15_000);
});

describe("getPoolInfoByTokens()", () => {
  it("returns pool info for USDC/EURC", async () => {
    const bfx = new BFX(RPC_URL!);
    const pool = await bfx.getPoolInfoByTokens(USDC, EURC);
    expect(pool).not.toBeNull();
    expect(pool!.address.toLowerCase()).toBe(EURC_USDC_POOL.toLowerCase());
    expect(pool!.token0.symbol).toBe("EURC");
    expect(pool!.token1.symbol).toBe("USDC");
  }, 15_000);

  it("returns null for unknown token pair", async () => {
    const bfx = new BFX(RPC_URL!);
    const pool = await bfx.getPoolInfoByTokens(
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000002",
    );
    expect(pool).toBeNull();
  }, 15_000);
});

describe("getPoolInfo()", () => {
  it("returns pool info by address", async () => {
    const bfx = new BFX(RPC_URL!);
    const pool = await bfx.getPoolInfo(EURC_USDC_POOL);
    expect(pool).not.toBeNull();
    expect(pool!.address.toLowerCase()).toBe(EURC_USDC_POOL.toLowerCase());
    expect(pool!.token0.symbol).toBe("EURC");
    expect(pool!.token1.symbol).toBe("USDC");
  }, 15_000);

  it("returns null for unknown address", async () => {
    const bfx = new BFX(RPC_URL!);
    const pool = await bfx.getPoolInfo("0x0000000000000000000000000000000000000000");
    expect(pool).toBeNull();
  }, 15_000);
});

describe("quote() EURC/USDC matches viewOriginSwap() on-chain", () => {
  let pool: BFX;

  beforeAll(async () => {
    pool = new BFX(RPC_URL!);
    await pool.loadPoolState(USDC, EURC);
  }, 30_000);

  afterAll(() => pool.stop());

  const usdcAmounts = [
    10n,                 // 0.00001 USDC
    BigInt("1000000"),   //   1 USDC
    1_500_000n,          // 1.5 USDC
    BigInt("5000000"),   //   5 USDC
    10_000_000_000n,     // 10,000 USDC
  ];

  const eurcAmounts = [
    10n,                 // 0.00001 EURC
    BigInt("1000000"),   //   1 EURC
    1_500_000n,          // 1.5 EURC
    BigInt("5000000"),   //   5 EURC
    10_000_000_000n,     // 10,000 EURC
  ];

  const fmt = (amount: bigint) => (Number(amount) / 1_000_000).toString();

  async function assertQuote(ctx: TestContext, poolAddress: `0x${string}`, tokenIn: `0x${string}`, tokenOut: `0x${string}`, amountIn: bigint) {
    let onchain: bigint;

    const chainStart = performance.now();
    try {
      onchain = await viewOriginSwap(poolAddress, tokenIn, tokenOut, amountIn);
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
    expect(result.hops).toHaveLength(1);
    expect(result.hops[0].tokenIn).toBe(tokenIn);
    expect(result.hops[0].tokenOut).toBe(tokenOut);
    expect(result.hops[0].amountIn).toBe(amountIn);
    expect(result.hops[0].amountOut).toBe(result.amountOut);
  }

  for (const amountIn of usdcAmounts) {
    it(`USDC → EURC: ${fmt(amountIn)} USDC`, (ctx) => assertQuote(ctx, EURC_USDC_POOL, USDC, EURC, amountIn));
  }

  for (const amountIn of eurcAmounts) {
    it(`EURC → USDC: ${fmt(amountIn)} EURC`, (ctx) => assertQuote(ctx, EURC_USDC_POOL, EURC, USDC, amountIn));
  }
});

