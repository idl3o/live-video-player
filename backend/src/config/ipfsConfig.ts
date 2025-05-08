/**
 * Configuration for IPFS integration
 */
export default {
  // Whether to use an external IPFS node (true) or embedded node (false)
  useExternalNode: true,
  
  // External node connection URL (used if useExternalNode is true)
  nodeUrl: 'http://localhost:5001/api/v0',
  
  // Gateway URL for accessing content
  gatewayUrl: 'http://localhost:8080/ipfs',
  
  // Public gateway as fallback
  publicGateway: 'https://ipfs.io/ipfs',
  
  // Embedded node configuration (used if useExternalNode is false)
  embeddedNode: {
    // Repository path for the embedded node
    repoPath: './ipfs-repo',
    
    // API configuration
    apiConfig: {
      host: '127.0.0.1',
      port: 5001
    },
    
    // Gateway configuration
    gatewayConfig: {
      host: '127.0.0.1',
      port: 8080
    },
    
    // Bootstrap nodes to connect to
    bootstrapList: [
      '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
      '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
      '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
      '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt'
    ]
  },
  
  // Pinning configuration
  pinning: {
    // Whether to automatically pin content when adding
    autoPinContent: true,
    
    // Maximum size (in bytes) that will be automatically pinned
    // Larger files need to be pinned explicitly
    maxPinSize: 50 * 1024 * 1024, // 50MB
    
    // Remote pinning services configuration
    remoteServices: [
      {
        name: 'Pinata',
        enabled: false,
        endpoint: 'https://api.pinata.cloud/psa',
        key: 'YOUR_PINATA_KEY',
        secret: 'YOUR_PINATA_SECRET'
      },
      {
        name: 'Web3.Storage',
        enabled: false,
        endpoint: 'https://api.web3.storage',
        token: 'YOUR_WEB3_STORAGE_TOKEN'
      }
    ]
  }
};