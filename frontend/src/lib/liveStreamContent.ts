import type { Address } from 'viem';

// Address of the deployed LiveStreamContent registry contract.
// Set VITE_LIVE_STREAM_CONTRACT after running:
//   cd blockchain && npx hardhat ignition deploy ./ignition/modules/LiveStreamContent.ts --network baseSepolia
export const LIVE_STREAM_CONTRACT = (import.meta.env.VITE_LIVE_STREAM_CONTRACT || '') as
  | Address
  | '';

export const isRegistryConfigured = (): boolean =>
  /^0x[a-fA-F0-9]{40}$/.test(LIVE_STREAM_CONTRACT);

// ABI for the focused on-chain registry. Mirrors LiveStreamContent.sol.
export const LIVE_STREAM_CONTENT_ABI = [
  {
    type: 'function',
    name: 'registerContent',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'contentCid', type: 'string' },
      { name: 'title', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getContent',
    stateMutability: 'view',
    inputs: [{ name: 'contentCid', type: 'string' }],
    outputs: [
      { name: 'creator', type: 'address' },
      { name: 'registeredAt', type: 'uint64' },
      { name: 'title', type: 'string' },
    ],
  },
  {
    type: 'function',
    name: 'isRegistered',
    stateMutability: 'view',
    inputs: [{ name: 'contentCid', type: 'string' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'event',
    name: 'ContentRegistered',
    inputs: [
      { name: 'contentCidIndexed', type: 'string', indexed: true },
      { name: 'contentCid', type: 'string' },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'registeredAt', type: 'uint64' },
      { name: 'title', type: 'string' },
    ],
  },
] as const;
