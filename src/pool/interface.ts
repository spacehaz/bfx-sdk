import type { Address, PoolState, QuoteResult, TransactionRequest } from "../types";
import type { BuildSwapParams } from "../swap";

export interface IBFX {
  quote(tokenIn: Address, tokenOut: Address, amountIn: bigint): QuoteResult;
  buildSwap(params: Omit<BuildSwapParams, "curveAddress">): TransactionRequest;
  getState(): PoolState;
  stop(): void;
}
