import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { quote as _quote } from "../quote";
import { buildSwap as _buildSwap, type BuildSwapParams } from "../swap";
import type { PoolState, Address, QuoteResult, TransactionRequest } from "../types";
import { CURVE_ABI } from "../abi/curve";
import { ERC20_ABI } from "../abi/erc20";
import { ORACLE_ABI } from "../abi/oracle";
import { fetchState, type ViemClient } from "./fetchState";
import { fetchPoolAddress, fetchPoolByTokens } from "./fetchPoolByTokens";
import { fetchPoolByAddress } from "./fetchPoolByAddress";
import { fetchAllPools } from "./fetchAllPools";
import type { PoolInfo } from "../types";
import type { IBFX } from "./interface";

type OracleLog = { args: { current?: bigint; roundId?: bigint; updatedAt?: bigint } };

export class BFX implements IBFX {
  private state: PoolState | null = null;
  private client: ViemClient;
  private unwatchers: (() => void)[] = [];

  constructor(rpcUrl: string) {
    this.client = createPublicClient({ chain: base, transport: http(rpcUrl) });
  }

  async loadPoolState(tokenA: Address, tokenB: Address): Promise<{ address: Address; state: PoolState }> {
    const curveAddress = await fetchPoolAddress(tokenA, tokenB);
    const { state, oracleA, oracleB } = await fetchState(this.client, curveAddress);

    this.stop();
    this.state = state;
    this.subscribe(oracleA, oracleB);

    return { address: curveAddress, state: { ...state } };
  }

  private requireState(): PoolState {
    if (!this.state) throw new Error("Pool not loaded. Call loadPoolState() first.");
    return this.state;
  }

  private subscribe(oracleA: Address, oracleB: Address): void {
    const unwatchA = this.client.watchContractEvent({
      address: oracleA,
      abi: ORACLE_ABI,
      eventName: "AnswerUpdated",
      onLogs: (logs: OracleLog[]) => {
        console.log("[BFX] AnswerUpdated (tokenA oracle)", logs);
        const latest = logs[logs.length - 1];
        if (latest.args.current !== undefined) {
          const prev = this.state!.tokenAOraclePrice;
          this.state = { ...this.state!, tokenAOraclePrice: BigInt(latest.args.current) };
          console.log("[BFX] tokenAOraclePrice updated", { prev, next: this.state.tokenAOraclePrice });
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
        const latest = logs[logs.length - 1];
        if (latest.args.current !== undefined) {
          const prev = this.state!.tokenBOraclePrice;
          this.state = { ...this.state!, tokenBOraclePrice: BigInt(latest.args.current) };
          console.log("[BFX] tokenBOraclePrice updated", { prev, next: this.state.tokenBOraclePrice });
        }
      },
      onError: (err) => console.error("[BFX] tokenB oracle watch error", err),
    });

    const unwatchTrade = this.client.watchContractEvent({
      address: this.state!.curveAddress,
      abi: CURVE_ABI,
      eventName: "Trade",
      onLogs: async (logs) => {
        console.log("[BFX] Trade event", logs);
        const [reserveA, reserveB] = await Promise.all([
          this.client.readContract({
            address: this.state!.tokenA,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [this.state!.curveAddress],
          }),
          this.client.readContract({
            address: this.state!.tokenB,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [this.state!.curveAddress],
          }),
        ]);
        const prev = { reserveA: this.state!.reserveA, reserveB: this.state!.reserveB };
        this.state = { ...this.state!, reserveA, reserveB };
        console.log("[BFX] reserves updated", { prev, next: { reserveA, reserveB } });
      },
      onError: (err) => console.error("[BFX] Trade watch error", err),
    });

    this.unwatchers = [unwatchA, unwatchB, unwatchTrade];
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
    return _quote(this.requireState(), tokenIn, tokenOut, amountIn);
  }

  buildSwap(params: Omit<BuildSwapParams, "curveAddress">): TransactionRequest {
    const { curveAddress } = this.requireState();
    return _buildSwap({ ...params, curveAddress });
  }

  getState(): PoolState {
    return { ...this.requireState() };
  }

  stop(): void {
    this.unwatchers.forEach((u) => u());
    this.unwatchers = [];
  }
}
