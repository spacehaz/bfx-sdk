import type { Address, PoolInfo } from "../types";
import { gql, toPair, PAIR_FIELDS, type RawPair } from "./graphql";

const QUERY = `
  query FindPair($token0: String!, $token1: String!) {
    pairs(first: 1, where: { token0: $token0, token1: $token1 }, subgraphError: deny) ${PAIR_FIELDS}
  }
`;

async function tryOrder(t0: string, t1: string): Promise<RawPair | null> {
  const data = await gql<{ pairs: RawPair[] }>(QUERY, { token0: t0, token1: t1 });
  return data.pairs[0] ?? null;
}

export async function fetchPoolByTokens(tokenA: Address, tokenB: Address): Promise<PoolInfo | null> {
  const a = tokenA.toLowerCase();
  const b = tokenB.toLowerCase();
  const raw = (await tryOrder(a, b)) ?? (await tryOrder(b, a));
  return raw ? toPair(raw) : null;
}

// used internally by BFX.loadPool
export async function fetchPoolAddress(tokenA: Address, tokenB: Address): Promise<Address> {
  const pool = await fetchPoolByTokens(tokenA, tokenB);
  if (!pool) throw new Error(`No pool found for tokens ${tokenA} / ${tokenB}`);
  return pool.address;
}
