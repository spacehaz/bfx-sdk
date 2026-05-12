import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { quote as _quote } from "../quote";
import { buildSwap as _buildSwap, type BuildSwapParams } from "../swap";
import type { PoolState, Address, QuoteResult, TransactionRequest } from "../types";
import { CURVE_ABI } from "../abi/curve";
import { ERC20_ABI } from "../abi/erc20";
import { ORACLE_ABI } from "../abi/oracle";
import { fetchState, type ViemClient } from "./fetchState";
import type { IBFX } from "./interface";

type OracleLog = { args: { current?: bigint; roundId?: bigint; updatedAt?: bigint } };

export class BFX implements IBFX {
  private state: PoolState;
  private client: ViemClient;
  private oracleA: Address;
  private oracleB: Address;
  private unwatchers: (() => void)[] = [];

  private constructor(state: PoolState, client: ViemClient, oracleA: Address, oracleB: Address) {
    this.state = state;
    this.client = client;
    this.oracleA = oracleA;
    this.oracleB = oracleB;
  }

  static async create(curveAddress: Address, rpcUrl: string): Promise<BFX> {
    const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
    const { state, oracleA, oracleB } = await fetchState(client, curveAddress);
    const pool = new BFX(state, client, oracleA, oracleB);
    pool.subscribe();
    return pool;
  }

  private subscribe(): void {
    const unwatchA = this.client.watchContractEvent({
      address: this.oracleA,
      abi: ORACLE_ABI,
      eventName: "AnswerUpdated",
      onLogs: (logs: OracleLog[]) => {
        const latest = logs[logs.length - 1];
        if (latest.args.current !== undefined) {
          this.state = { ...this.state, tokenAOraclePrice: BigInt(latest.args.current) };
        }
      },
    });

    const unwatchB = this.client.watchContractEvent({
      address: this.oracleB,
      abi: ORACLE_ABI,
      eventName: "AnswerUpdated",
      onLogs: (logs: OracleLog[]) => {
        const latest = logs[logs.length - 1];
        if (latest.args.current !== undefined) {
          this.state = { ...this.state, tokenBOraclePrice: BigInt(latest.args.current) };
        }
      },
    });

    const unwatchTrade = this.client.watchContractEvent({
      address: this.state.curveAddress,
      abi: CURVE_ABI,
      eventName: "Trade",
      onLogs: async () => {
        const [reserveA, reserveB] = await Promise.all([
          this.client.readContract({
            address: this.state.tokenA,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [this.state.curveAddress],
          }),
          this.client.readContract({
            address: this.state.tokenB,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [this.state.curveAddress],
          }),
        ]);
        this.state = { ...this.state, reserveA, reserveB };
      },
    });

    this.unwatchers = [unwatchA, unwatchB, unwatchTrade];
  }

  quote(tokenIn: Address, tokenOut: Address, amountIn: bigint): QuoteResult {
    return _quote(this.state, tokenIn, tokenOut, amountIn);
  }

  buildSwap(params: Omit<BuildSwapParams, "curveAddress">): TransactionRequest {
    return _buildSwap({ ...params, curveAddress: this.state.curveAddress });
  }

  getState(): PoolState {
    return { ...this.state };
  }

  stop(): void {
    this.unwatchers.forEach((u) => u());
    this.unwatchers = [];
  }
}
