import type { Address, PoolInfo } from "../types";

export const GRAPHQL_URL =
  "https://api.goldsky.com/api/public/project_cm8g2ca7b0ewq01uea1xl12vp/subgraphs/amm-v3-base/2.0.0/gn";

export const PAIR_FIELDS = `{ id token0 { id symbol } token1 { id symbol } }`;

export type RawPair = {
  id: string;
  token0: { id: string; symbol: string };
  token1: { id: string; symbol: string };
};

export function toPair(raw: RawPair): PoolInfo {
  return {
    address: raw.id as Address,
    token0: { address: raw.token0.id as Address, symbol: raw.token0.symbol },
    token1: { address: raw.token1.id as Address, symbol: raw.token1.symbol },
  };
}

export async function gql<T>(query: string, variables?: Record<string, string>): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL request failed: ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`GraphQL error: ${json.errors[0].message}`);
  return json.data;
}
