/**
 * Configuration for Helia IPFS integration.
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

  recording: {
    // Auto-upload finished recordings to IPFS after the stream ends.
    autoUpload: false,
    // Keep the local mp4 on disk after upload.
    keepLocal: true,
  },
};
