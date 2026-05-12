import { encodeFunctionData } from "viem";
import { CURVE_ABI } from "./abi/curve";
import type { Address, TransactionRequest } from "./types";

export type BuildSwapParams = {
  curveAddress: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minAmountOut: bigint; // from quote.amountOut * (1 - slippage tolerance)
  recipient: Address;   // unused by originSwap — msg.sender receives tokens
  deadline: number;
};

// Encodes calldata for originSwap on the Curve contract.
// The caller is responsible for approving tokenIn before submitting.
export function buildSwap(params: BuildSwapParams): TransactionRequest {
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

  return {
    to: params.curveAddress,
    data,
    value: 0n,
  };
}
