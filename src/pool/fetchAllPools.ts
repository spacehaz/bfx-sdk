import type { PoolInfo } from "../types";
import { gql, toPair, PAIR_FIELDS, type RawPair } from "./graphql";

const QUERY = `{ pairs(first: 100, subgraphError: deny) ${PAIR_FIELDS} }`;

export async function fetchAllPools(): Promise<PoolInfo[]> {
  const data = await gql<{ pairs: RawPair[] }>(QUERY);
  return data.pairs.map(toPair);
}
