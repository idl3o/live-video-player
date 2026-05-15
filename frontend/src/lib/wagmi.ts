import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { baseSepolia } from 'wagmi/chains';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'live-video-player-dev';

export const wagmiConfig = getDefaultConfig({
  appName: 'Live Video Player',
  projectId,
  chains: [baseSepolia],
  ssr: false,
});

export const targetChain = baseSepolia;
