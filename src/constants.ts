// 1.0 in 64x64 fixed-point (2^64)
export const ONE = 0x10000000000000000n;

// BFX Router on Base — handles both single-hop and multi-hop swaps
export const ROUTER_ADDRESS = "0xa7ddef992fda672717e82698dfa3ff932c26441e" as const;

// USDC on Base — the quote currency bridging all BFX pools
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

// Maximum fee per token per trade: 0.25 (25%) in 64x64
export const MAX_FEE = 0x4000000000000000n;

// Minimum allowed pool utility change after a swap (Shell Protocol whitepaper)
export const MIN_UTILITY_DIFF = -0x10C6F7A0B5EEn;
