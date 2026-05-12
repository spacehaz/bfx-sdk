// Signed 64.64-bit fixed-point number, represented as bigint.
// Actual value = bigint / 2^64
// Example: 1.08 is stored as 1.08 * 2^64 = 19911654368509083648n
export type i128 = bigint;
