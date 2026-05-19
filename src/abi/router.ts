export const ROUTER_ABI = [
  {
    name: "getCurve",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_token0", type: "address" },
      { name: "_token1", type: "address" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "originSwap",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_origin", type: "address" },
      { name: "_target", type: "address" },
      { name: "_originAmount", type: "uint256" },
      { name: "_minTargetAmount", type: "uint256" },
      { name: "_deadline", type: "uint256" },
    ],
    outputs: [{ name: "targetAmount_", type: "uint256" }],
  },
] as const;
