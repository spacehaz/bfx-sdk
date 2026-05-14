import type { Address, PoolInfo } from "../types";
import { gql, toPair, PAIR_FIELDS, type RawPair } from "./graphql";

const QUERY = `
  query GetPair($id: ID!) {
    pair(id: $id, subgraphError: deny) ${PAIR_FIELDS}
  }
`;

export async function fetchPoolByAddress(address: Address): Promise<PoolInfo | null> {
  const data = await gql<{ pair: RawPair | null }>(QUERY, { id: address.toLowerCase() });
  return data.pair ? toPair(data.pair) : null;
}
