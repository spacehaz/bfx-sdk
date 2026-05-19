import { encodeFunctionData } from "viem";
import { CURVE_ABI } from "./abi/curve";
import { ROUTER_ABI } from "./abi/router";
import type { Address, TransactionRequest } from "./types";

export type BuildSwapParams = {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minAmountOut: bigint; // from quote.amountOut * (1 - slippage tolerance)
  recipient: Address;   // unused by originSwap — msg.sender receives tokens
  deadline: number;
};

// Encodes calldata for a single-hop swap directly on the Curve contract.
export function buildSingleHopSwap(params: BuildSwapParams & { curveAddress: Address }): TransactionRequest {
  const data = encodeFunctionData({
    abi: CURVE_ABI,
    functionName: "originSwap",
    args: [
      params.tokenIn,
      params.tokenOut,
      params.amountIn,
      params.minAmountOut,
      BigInt(params.deadline),
    ],
  });

  return { to: params.curveAddress, data, value: 0n };
}

// Encodes calldata for a multi-hop swap through the Router contract.
export function buildMultiHopSwap(params: BuildSwapParams & { routerAddress: Address; path: Address[] }): TransactionRequest {
  const data = encodeFunctionData({
    abi: ROUTER_ABI,
    functionName: "originSwap",
    args: [
      params.amountIn,
      params.minAmountOut,
      params.path,
      BigInt(params.deadline),
    ],
  });

  return { to: params.routerAddress, data, value: 0n };
}
