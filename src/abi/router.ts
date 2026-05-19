export const ROUTER_ABI = [
  {
    name: "originSwap",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_originAmount", type: "uint256" },
      { name: "_minTargetAmount", type: "uint256" },
      { name: "_path", type: "address[]" },
      { name: "_deadline", type: "uint256" },
    ],
    outputs: [{ name: "targetAmount_", type: "uint256" }],
  },
  {
    name: "viewOriginSwap",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_path", type: "address[]" },
      { name: "_originAmount", type: "uint256" },
    ],
    outputs: [{ name: "targetAmount_", type: "uint256" }],
  },
] as const;
