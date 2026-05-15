/**
 * Configuration for Helia IPFS + optional Storacha (Filecoin) pinning.
 */
export default {
  // Local gateway URL used when the embedded Helia node is up.
  gatewayUrl: 'http://localhost:8080/ipfs',

  // Public gateway used as a fallback for URL construction.
  publicGateway: 'https://ipfs.io/ipfs',

  embeddedNode: {
    // On-disk repo path for the Helia blockstore + datastore.
    repoPath: './ipfs-repo',
  },

  storacha: {
    // When true, finished recordings are also uploaded to Storacha
    // (Filecoin-backed pinning) on top of the local Helia node.
    enabled: !!process.env.STORACHA_KEY && !!process.env.STORACHA_PROOF,
    // Agent key (private). Created via `storacha key create`.
    key: process.env.STORACHA_KEY,
    // Delegation proof allowing this agent to upload to a Space.
    // Created via `storacha delegation create --output proof.car` on
    // the machine that owns the Space, then base64-encoded for env.
    proof: process.env.STORACHA_PROOF,
    // Public gateway used for share links to uploaded content.
    gatewayUrl: 'https://w3s.link/ipfs',
  },

  recording: {
    // Auto-upload finished recordings to IPFS after the stream ends.
    autoUpload: false,
    // Keep the local mp4 on disk after upload.
    keepLocal: true,
  },
};
