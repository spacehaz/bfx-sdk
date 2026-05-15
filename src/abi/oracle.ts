export const ORACLE_ABI = [
  {
    name: "AnswerUpdated",
    type: "event",
    inputs: [
      { name: "current", type: "int256", indexed: true },
      { name: "roundId", type: "uint256", indexed: true },
      { name: "updatedAt", type: "uint256", indexed: false },
    ],
  },
  {
    name: "aggregator",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;
