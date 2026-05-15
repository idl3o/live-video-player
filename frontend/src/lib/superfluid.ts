import type { Address } from 'viem';

// CFAv1Forwarder is deployed via CREATE2 at the same address on every chain
// Superfluid supports, including Base + Base Sepolia.
// https://github.com/superfluid-finance/protocol-monorepo
export const CFA_FORWARDER: Address = '0xcfA132E353cB4E398080B9700609bb008eceB125';

// The Super Token used to stream payments. Must be configured per deployment.
// On Base Sepolia, Superfluid recommends using a Pure Super Token of the user's
// choice (USDCx, ETHx, fUSDCx for testing, etc.).
// Set VITE_PAYMENT_SUPER_TOKEN to the address of the Super Token you want to use.
export const PAYMENT_SUPER_TOKEN = (import.meta.env.VITE_PAYMENT_SUPER_TOKEN ||
  '') as Address | '';

// Decimals exposed by the Super Token wrapper (almost always 18, regardless
// of the underlying token's native decimals — Superfluid normalizes).
export const SUPER_TOKEN_DECIMALS = 18;

export const isPaymentStreamConfigured = (): boolean =>
  /^0x[a-fA-F0-9]{40}$/.test(PAYMENT_SUPER_TOKEN);

// CFAv1Forwarder: the user-friendly entry point for Constant Flow Agreements.
export const CFA_FORWARDER_ABI = [
  {
    type: 'function',
    name: 'createFlow',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'sender', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'flowrate', type: 'int96' },
      { name: 'userData', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'updateFlow',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'sender', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'flowrate', type: 'int96' },
      { name: 'userData', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'deleteFlow',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'sender', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'userData', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getFlowInfo',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'sender', type: 'address' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [
      { name: 'lastUpdated', type: 'uint256' },
      { name: 'flowrate', type: 'int96' },
      { name: 'deposit', type: 'uint256' },
      { name: 'owedDeposit', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getFlowrate',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'sender', type: 'address' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [{ name: '', type: 'int96' }],
  },
] as const;

// Minimal SuperToken ABI — balanceOf and upgrade/downgrade (wrap/unwrap).
export const SUPER_TOKEN_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'upgrade',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'downgrade',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getUnderlyingToken',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

// Convert "$ per hour" → wei/sec (int96). Token assumed 18-decimal Super Token.
export function dollarsPerHourToFlowRate(dollarsPerHour: number): bigint {
  if (!Number.isFinite(dollarsPerHour) || dollarsPerHour <= 0) return 0n;
  // 10^18 wei = 1 token. Per second = perHour / 3600.
  // Use scaled int math to avoid Number precision issues.
  const microPerHour = BigInt(Math.round(dollarsPerHour * 1_000_000));
  return (microPerHour * 10n ** 12n) / 3600n;
}

export function flowRateToDollarsPerHour(flowRate: bigint): number {
  // flowRate is wei/sec. perHour = flowRate * 3600. Then / 1e18.
  const perHour = flowRate * 3600n;
  return Number(perHour) / 1e18;
}
