import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { quote as _quote } from "../quote";
import { buildSingleHopSwap, buildMultiHopSwap, type BuildSwapParams } from "../swap";
import type { PoolState, Address, QuoteResult, TransactionRequest } from "../types";
import { CURVE_ABI } from "../abi/curve";
import { ERC20_ABI } from "../abi/erc20";
import { ORACLE_ABI } from "../abi/oracle";
import { fetchState, type ViemClient } from "./fetchState";
import { fetchPoolAddress, fetchPoolByTokens } from "./fetchPoolByTokens";
import { ROUTER_ADDRESS, USDC_ADDRESS } from "../constants";
import { fetchPoolByAddress } from "./fetchPoolByAddress";
import { fetchAllPools } from "./fetchAllPools";
import type { PoolInfo } from "../types";
import type { IBFX } from "./interface";

type OracleLog = { args: { current?: bigint; roundId?: bigint; updatedAt?: bigint } };

type LoadedPool = {
  state: PoolState;
  unwatchers: (() => void)[];
};

export class BFX implements IBFX {
  private pools: Map<string, LoadedPool> = new Map();
  private client: ViemClient;

  private poolKey(a: Address, b: Address): string {
    return a.toLowerCase() < b.toLowerCase()
      ? `${a.toLowerCase()}-${b.toLowerCase()}`
      : `${b.toLowerCase()}-${a.toLowerCase()}`;
  }

  private findPool(tokenA: Address, tokenB: Address): PoolState | null {
    return this.pools.get(this.poolKey(tokenA, tokenB))?.state ?? null;
  }

  constructor(rpcUrl: string) {
    this.client = createPublicClient({ chain: base, transport: http(rpcUrl) });
  }

  private async loadSingleCurve(curveAddress: Address): Promise<PoolState> {
    const { state, oracleA, oracleB } = await fetchState(this.client, curveAddress);
    const key = this.poolKey(state.tokenA, state.tokenB);

    // Stop existing subscriptions if this pool is being reloaded
    this.pools.get(key)?.unwatchers.forEach((u) => u());

    const unwatchers = this.buildSubscription(key, state, oracleA, oracleB);
    this.pools.set(key, { state, unwatchers });
    return state;
  }

  async loadPoolState(tokenA: Address, tokenB: Address): Promise<{ address: Address; state: PoolState }[]> {
    const isDirectPool =
      tokenA.toLowerCase() === USDC_ADDRESS.toLowerCase() ||
      tokenB.toLowerCase() === USDC_ADDRESS.toLowerCase();

    if (isDirectPool) {
      const address = await fetchPoolAddress(tokenA, tokenB);
      const state = await this.loadSingleCurve(address);
      return [{ address, state: { ...state } }];
    }

    // Multi-hop: load both USDC bridge pools in parallel
    const [addressA, addressB] = await Promise.all([
      fetchPoolAddress(tokenA, USDC_ADDRESS),
      fetchPoolAddress(tokenB, USDC_ADDRESS),
    ]);

    const [stateA, stateB] = await Promise.all([
      this.loadSingleCurve(addressA),
      this.loadSingleCurve(addressB),
    ]);

    return [
      { address: addressA, state: { ...stateA } },
      { address: addressB, state: { ...stateB } },
    ];
  }

  private buildSubscription(key: string, state: PoolState, oracleA: Address, oracleB: Address): (() => void)[] {
    const unwatchA = this.client.watchContractEvent({
      address: oracleA,
      abi: ORACLE_ABI,
      eventName: "AnswerUpdated",
      onLogs: (logs: OracleLog[]) => {
        console.log("[BFX] AnswerUpdated (tokenA oracle)", logs);
        const entry = this.pools.get(key);
        if (!entry) return;
        const latest = logs[logs.length - 1];
        if (latest.args.current !== undefined) {
          const prev = entry.state.tokenAOraclePrice;
          entry.state = { ...entry.state, tokenAOraclePrice: BigInt(latest.args.current) };
          console.log("[BFX] tokenAOraclePrice updated", { prev, next: entry.state.tokenAOraclePrice });
        }
      },
      onError: (err) => console.error("[BFX] tokenA oracle watch error", err),
    });

    const unwatchB = this.client.watchContractEvent({
      address: oracleB,
      abi: ORACLE_ABI,
      eventName: "AnswerUpdated",
      onLogs: (logs: OracleLog[]) => {
        console.log("[BFX] AnswerUpdated (tokenB oracle)", logs);
        const entry = this.pools.get(key);
        if (!entry) return;
        const latest = logs[logs.length - 1];
        if (latest.args.current !== undefined) {
          const prev = entry.state.tokenBOraclePrice;
          entry.state = { ...entry.state, tokenBOraclePrice: BigInt(latest.args.current) };
          console.log("[BFX] tokenBOraclePrice updated", { prev, next: entry.state.tokenBOraclePrice });
        }
      },
      onError: (err) => console.error("[BFX] tokenB oracle watch error", err),
    });

    const unwatchTrade = this.client.watchContractEvent({
      address: state.curveAddress,
      abi: CURVE_ABI,
      eventName: "Trade",
      onLogs: async () => {
        console.log("[BFX] Trade event on", state.curveAddress);
        const entry = this.pools.get(key);
        if (!entry) return;
        const [reserveA, reserveB] = await Promise.all([
          this.client.readContract({ address: entry.state.tokenA, abi: ERC20_ABI, functionName: "balanceOf", args: [entry.state.curveAddress] }),
          this.client.readContract({ address: entry.state.tokenB, abi: ERC20_ABI, functionName: "balanceOf", args: [entry.state.curveAddress] }),
        ]);
        const prev = { reserveA: entry.state.reserveA, reserveB: entry.state.reserveB };
        entry.state = { ...entry.state, reserveA, reserveB };
        console.log("[BFX] reserves updated", { prev, next: { reserveA, reserveB } });
      },
      onError: (err) => console.error("[BFX] Trade watch error", err),
    });

    return [unwatchA, unwatchB, unwatchTrade];
  }

  getPoolInfoByTokens(tokenA: Address, tokenB: Address): Promise<PoolInfo | null> {
    return fetchPoolByTokens(tokenA, tokenB);
  }

  getPoolInfo(address: Address): Promise<PoolInfo | null> {
    return fetchPoolByAddress(address);
  }

  getAllPoolsInfo(): Promise<PoolInfo[]> {
    return fetchAllPools();
  }

  quote(tokenIn: Address, tokenOut: Address, amountIn: bigint): QuoteResult {
    const tIn  = tokenIn.toLowerCase() as Address;
    const tOut = tokenOut.toLowerCase() as Address;

    // Single-hop
    const direct = this.findPool(tIn, tOut);
    if (direct) return _quote(direct, tIn, tOut, amountIn);

    // Multi-hop via USDC
    const pool1 = this.findPool(tIn, USDC_ADDRESS);
    const pool2 = this.findPool(USDC_ADDRESS, tOut);

    if (!pool1 || !pool2) throw new Error(`No route from ${tIn} to ${tOut}. Call loadPoolState() first.`);

    const hop1 = _quote(pool1, tIn, USDC_ADDRESS, amountIn);
    const hop2 = _quote(pool2, USDC_ADDRESS, tOut, hop1.amountOut);

    return {
      amountOut: hop2.amountOut,
      priceImpactBps: hop1.priceImpactBps + hop2.priceImpactBps,
      effectivePrice: (hop2.amountOut * 10n ** 18n) / amountIn,
      fee: hop2.fee,
      hops: [
        { tokenIn: tIn, tokenOut: USDC_ADDRESS, amountIn, amountOut: hop1.amountOut, fee: hop1.fee },
        { tokenIn: USDC_ADDRESS, tokenOut: tOut, amountIn: hop1.amountOut, amountOut: hop2.amountOut, fee: hop2.fee },
      ],
    };
  }

  buildSwap(params: BuildSwapParams): TransactionRequest {
    const tIn  = params.tokenIn.toLowerCase() as Address;
    const tOut = params.tokenOut.toLowerCase() as Address;
    const normalized = { ...params, tokenIn: tIn, tokenOut: tOut };

    // Single-hop — call the curve directly
    const direct = this.findPool(tIn, tOut);
    if (direct) return buildSingleHopSwap({ ...normalized, curveAddress: direct.curveAddress });

    // Multi-hop — call the Router
    const pool1 = this.findPool(tIn, USDC_ADDRESS);
    const pool2 = this.findPool(USDC_ADDRESS, tOut);
    if (!pool1 || !pool2) throw new Error(`No route from ${tIn} to ${tOut}. Call loadPoolState() first.`);

    return buildMultiHopSwap({ ...normalized, routerAddress: ROUTER_ADDRESS, path: [tIn, USDC_ADDRESS, tOut] });
  }

  getPoolState(tokenA: Address, tokenB: Address): PoolState {
    const pool = this.findPool(tokenA, tokenB);
    if (!pool) throw new Error(`Pool for ${tokenA}/${tokenB} not loaded. Call loadPoolState() first.`);
    return { ...pool };
  }

  stop(): void {
    this.pools.forEach(({ unwatchers }) => unwatchers.forEach((u) => u()));
    this.pools.clear();
  }
}
