import { createPublicClient } from "viem";
import { divu } from "../math/abdk/abdk";
import type { PoolState, Address, CurveParams } from "../types";
import { CURVE_ABI } from "../abi/curve";
import { ASSIMILATOR_ABI } from "../abi/assimilator";
import { ERC20_ABI } from "../abi/erc20";
import { ORACLE_ABI } from "../abi/oracle";

export type ViemClient = Pick<
  ReturnType<typeof createPublicClient>,
  "readContract" | "getBlockNumber" | "watchContractEvent"
>;

// All DFX pools are 50/50 — weights are always [0.5, 0.5] in 64x64. DFX pools are always designed as 50/50 by value, meaning when the pool is perfectly balanced, each token should represent 50% of the total value.
const WEIGHT = divu(5n * 10n ** 17n, 10n ** 18n);

// viewCurve() returns params scaled by 1e18 via mulu — divu recovers the 64x64 value.
function fromScaled(x: bigint) {
  return divu(x, 10n ** 18n);
}

export async function fetchState(
  client: ViemClient,
  curveAddress: Address,
): Promise<{ state: PoolState; oracleA: Address; oracleB: Address }> {
  // Round 1: curve params + token addresses
  const [viewCurveResult, tokenA, tokenB, blockNumber] = await Promise.all([
    client.readContract({ address: curveAddress, abi: CURVE_ABI, functionName: "viewCurve" }),
    client.readContract({ address: curveAddress, abi: CURVE_ABI, functionName: "reserves", args: [0n] }),
    client.readContract({ address: curveAddress, abi: CURVE_ABI, functionName: "reserves", args: [1n] }),
    client.getBlockNumber(),
  ]);

  // Round 2: assimilators + token decimals + raw reserves
  const [assimilatorA, assimilatorB, tokenADecimals, tokenBDecimals, reserveA, reserveB] =
    await Promise.all([
      client.readContract({ address: curveAddress, abi: CURVE_ABI, functionName: "assimilator", args: [tokenA] }),
      client.readContract({ address: curveAddress, abi: CURVE_ABI, functionName: "assimilator", args: [tokenB] }),
      client.readContract({ address: tokenA, abi: ERC20_ABI, functionName: "decimals" }),
      client.readContract({ address: tokenB, abi: ERC20_ABI, functionName: "decimals" }),
      client.readContract({ address: tokenA, abi: ERC20_ABI, functionName: "balanceOf", args: [curveAddress] }),
      client.readContract({ address: tokenB, abi: ERC20_ABI, functionName: "balanceOf", args: [curveAddress] }),
    ]);

  // Round 3: oracle rates + oracle proxy addresses
  const [tokenAOraclePrice, tokenBOraclePrice, oracleDecimals, oracleProxyA, oracleProxyB] =
    await Promise.all([
      client.readContract({ address: assimilatorA, abi: ASSIMILATOR_ABI, functionName: "getRate" }),
      client.readContract({ address: assimilatorB, abi: ASSIMILATOR_ABI, functionName: "getRate" }),
      client.readContract({ address: assimilatorA, abi: ASSIMILATOR_ABI, functionName: "oracleDecimals" }),
      client.readContract({ address: assimilatorA, abi: ASSIMILATOR_ABI, functionName: "oracle" }),
      client.readContract({ address: assimilatorB, abi: ASSIMILATOR_ABI, functionName: "oracle" }),
    ]);

  // Round 4: resolve underlying aggregators — AnswerUpdated is emitted on the aggregator, not the proxy
  const [oracleA, oracleB] = await Promise.all([
    client.readContract({ address: oracleProxyA, abi: ORACLE_ABI, functionName: "aggregator" }),
    client.readContract({ address: oracleProxyB, abi: ORACLE_ABI, functionName: "aggregator" }),
  ]);

  const params: CurveParams = {
    alpha: fromScaled(viewCurveResult[0]),
    beta: fromScaled(viewCurveResult[1]),
    delta: fromScaled(viewCurveResult[2]),
    epsilon: fromScaled(viewCurveResult[3]),
    lambda: fromScaled(viewCurveResult[4]),
    weights: [WEIGHT, WEIGHT],
  };

  return {
    state: {
      curveAddress,
      tokenA,
      tokenB,
      tokenADecimals,
      tokenBDecimals,
      reserveA,
      reserveB,
      tokenAOraclePrice,
      tokenBOraclePrice,
      oracleDecimals: Number(oracleDecimals),
      params,
      blockNumber,
    },
    oracleA,
    oracleB,
  };
}
