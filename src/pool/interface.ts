import type { Address, PoolState, PoolInfo, QuoteResult, TransactionRequest } from "../types";
import type { BuildSwapParams } from "../swap";

export interface IBFX {
  loadPoolState(tokenA: Address, tokenB: Address): Promise<{ address: Address; state: PoolState }>;
  getPoolInfo(address: Address): Promise<PoolInfo | null>;
  getAllPoolsInfo(): Promise<PoolInfo[]>;
  quote(tokenIn: Address, tokenOut: Address, amountIn: bigint): QuoteResult;
  buildSwap(params: Omit<BuildSwapParams, "curveAddress">): TransactionRequest;
  getState(): PoolState;
  stop(): void;
}
