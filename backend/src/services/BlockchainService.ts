import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { LoggerService } from './LoggerService';
import { IPFSService } from './IPFSService';

/**
 * Interface for content ownership record
 */
interface ContentOwnership {
  contentId: string;    // Content identifier (CID)
  owner: string;        // Owner's wallet address
  title: string;        // Content title
  description?: string; // Optional description
  timestamp: number;    // Creation timestamp
  signature?: string;   // Owner's signature
  transactionHash?: string; // Blockchain transaction hash
}

/**
 * Interface for blockchain transaction
 */
interface BlockchainTransaction {
  hash: string;
  blockNumber?: number;
  timestamp?: number;
  confirmations: number;
}

/**
 * Interface for token details
 */
interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
}

/**
 * Interface for supported blockchain networks
 */
interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  contractAddress: string;
  enabled: boolean;
}

/**
 * Interface for stream tip/donation
 */
interface StreamTip {
  id: string;
  streamId: string;
  sender: string;
  recipient: string;
  amount: string;
  currency: string;
  message?: string;
  timestamp: number;
  transactionHash?: string;
}

/**
 * Interface for content NFT metadata
 */
interface ContentNFTMetadata {
  name: string;
  description: string;
  image: string; // IPFS URL to thumbnail
  contentUrl: string; // IPFS URL to content
  attributes: {
    trait_type: string;
    value: string;
  }[];
  creator: string;
  createdAt: number;
}

/**
 * Service for blockchain integration
 */
export class BlockchainService {
  private logger: LoggerService;
  private ipfsService: IPFSService;
  private provider: ethers.providers.JsonRpcProvider | null;
  private wallet: ethers.Wallet | null;
  private contract: ethers.Contract | null;
  private networks: NetworkConfig[];
  private currentNetwork: NetworkConfig | null;
  private contractAbi: any;
  private isInitialized: boolean;
  private storagePath: string;

  /**
   * Constructor for BlockchainService
   */
  constructor(logger: LoggerService, ipfsService: IPFSService) {
    this.logger = logger;
    this.ipfsService = ipfsService;
    this.provider = null;
    this.wallet = null;
    this.contract = null;
    this.networks = this.loadNetworkConfigurations();
    this.currentNetwork = null;
    this.contractAbi = this.loadContractAbi();
    this.isInitialized = false;
    this.storagePath = path.join(process.cwd(), 'data', 'blockchain');
    
    // Ensure storage directory exists
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  /**
   * Initialize the blockchain service
   */
  public async initialize(networkName?: string): Promise<boolean> {
    try {
      this.logger.info('Initializing BlockchainService');
      
      // Select network
      const network = networkName 
        ? this.networks.find(n => n.name === networkName && n.enabled)
        : this.networks.find(n => n.enabled);
      
      if (!network) {
        throw new Error(`No suitable blockchain network found${networkName ? ` with name ${networkName}` : ''}`);
      }
      
      this.currentNetwork = network;
      this.logger.info(`Using blockchain network: ${network.name}`);
      
      // Initialize provider
      this.provider = new ethers.providers.JsonRpcProvider(network.rpcUrl);
      
      // Check connection
      const blockNumber = await this.provider.getBlockNumber();
      this.logger.info(`Connected to blockchain. Current block: ${blockNumber}`);
      
      // Initialize wallet if private key is provided
      const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY;
      if (privateKey) {
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        const walletAddress = await this.wallet.getAddress();
        this.logger.info(`Wallet initialized: ${walletAddress}`);
        
        // Initialize contract
        this.contract = new ethers.Contract(
          network.contractAddress,
          this.contractAbi,
          this.wallet
        );
      } else {
        this.logger.info('No private key provided. Operating in read-only mode.');
        
        // Initialize contract in read-only mode
        this.contract = new ethers.Contract(
          network.contractAddress,
          this.contractAbi,
          this.provider
        );
      }
      
      this.isInitialized = true;
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize blockchain service', error);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Load network configurations from environment or configuration file
   */
  private loadNetworkConfigurations(): NetworkConfig[] {
    // Default configuration for Ethereum mainnet
    const defaultNetworks: NetworkConfig[] = [
      {
        name: 'localhost',
        chainId: 1337,
        rpcUrl: 'http://localhost:8545',
        explorerUrl: 'http://localhost:8545',
        contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3', // Default hardhat deployment address
        enabled: true
      },
      {
        name: 'ethereum-mainnet',
        chainId: 1,
        rpcUrl: 'https://eth-mainnet.public.blastapi.io',
        explorerUrl: 'https://etherscan.io',
        contractAddress: '0x0000000000000000000000000000000000000000', // To be replaced
        enabled: false
      },
      {
        name: 'ethereum-sepolia',
        chainId: 11155111,
        rpcUrl: 'https://eth-sepolia.public.blastapi.io',
        explorerUrl: 'https://sepolia.etherscan.io',
        contractAddress: '0x0000000000000000000000000000000000000000', // To be replaced
        enabled: false
      },
      {
        name: 'polygon-mainnet',
        chainId: 137,
        rpcUrl: 'https://polygon-rpc.com',
        explorerUrl: 'https://polygonscan.com',
        contractAddress: '0x0000000000000000000000000000000000000000', // To be replaced
        enabled: false
      },
      {
        name: 'polygon-mumbai',
        chainId: 80001,
        rpcUrl: 'https://rpc-mumbai.maticvigil.com',
        explorerUrl: 'https://mumbai.polygonscan.com',
        contractAddress: '0x0000000000000000000000000000000000000000', // To be replaced
        enabled: false
      }
    ];
    
    // TODO: Load from configuration file or environment variables
    return defaultNetworks;
  }

  /**
   * Load contract ABI from file
   */
  private loadContractAbi(): any {
    // Basic default ABI for testing, should be loaded from a file
    const defaultAbi = [
      "function registerContent(string contentId, string title, string description) returns (uint256)",
      "function getContent(uint256 id) view returns (string contentId, address owner, string title, string description, uint256 timestamp)",
      "function verifyContent(string contentId, address owner, bytes signature) view returns (bool)",
      "function tipCreator(address creator) payable",
      "function mintNFT(string contentId, string metadataURI) returns (uint256)",
      "function contentToNFT(string contentId) view returns (uint256)",
      "event ContentRegistered(uint256 indexed id, string contentId, address indexed owner, uint256 timestamp)",
      "event CreatorTipped(address indexed creator, address indexed tipper, uint256 amount)",
      "event NFTMinted(uint256 indexed tokenId, string contentId, address indexed owner)"
    ];
    
    // TODO: Load from file
    return defaultAbi;
  }

  /**
   * Register content ownership on the blockchain
   */
  public async registerContent(contentId: string, title: string, description: string = "", owner?: string): Promise<{success: boolean, contentOwnership?: ContentOwnership, error?: string}> {
    try {
      if (!this.isInitialized) {
        throw new Error('BlockchainService not initialized');
      }
      
      if (!this.wallet) {
        throw new Error('No wallet initialized. Cannot register content.');
      }
      
      const ownerAddress = owner || await this.wallet.getAddress();
      
      this.logger.info(`Registering content ownership: ${contentId} - Owner: ${ownerAddress}`);
      
      // First create local record
      const contentOwnership: ContentOwnership = {
        contentId,
        owner: ownerAddress,
        title,
        description,
        timestamp: Math.floor(Date.now() / 1000),
      };
      
      // Store locally first
      this.storeContentOwnership(contentOwnership);
      
      // If contract is available, register on blockchain
      if (this.contract) {
        try {
          // Register on blockchain
          const tx = await this.contract.registerContent(contentId, title, description);
          this.logger.info(`Content registration transaction sent: ${tx.hash}`);
          
          // Wait for transaction confirmation
          const receipt = await tx.wait(1);
          
          if (receipt && receipt.status === 1) {
            this.logger.info(`Content registered successfully on blockchain: ${contentId}`);
            
            // Update local record with transaction hash
            contentOwnership.transactionHash = tx.hash;
            this.storeContentOwnership(contentOwnership);
            
            return {
              success: true,
              contentOwnership
            };
          } else {
            throw new Error('Transaction failed');
          }
        } catch (error) {
          this.logger.error(`Error registering content on blockchain: ${contentId}`, error);
          
          // Return the local record even if blockchain registration failed
          return {
            success: false,
            contentOwnership,
            error: `Blockchain registration failed: ${error}`
          };
        }
      } else {
        // No contract, just return the local record
        return {
          success: true,
          contentOwnership
        };
      }
    } catch (error) {
      this.logger.error('Error in registerContent', error);
      return {
        success: false,
        error: `Failed to register content: ${error}`
      };
    }
  }

  /**
   * Store content ownership record locally
   */
  private storeContentOwnership(contentOwnership: ContentOwnership): void {
    const filePath = path.join(this.storagePath, `content-${contentOwnership.contentId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(contentOwnership, null, 2));
  }

  /**
   * Get content ownership record
   */
  public async getContentOwnership(contentId: string): Promise<{success: boolean, contentOwnership?: ContentOwnership, error?: string}> {
    try {
      const filePath = path.join(this.storagePath, `content-${contentId}.json`);
      
      // Try to get from local storage first
      if (fs.existsSync(filePath)) {
        const contentOwnership = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        // If we have a contract and transaction hash, verify on blockchain
        if (this.contract && contentOwnership.transactionHash) {
          try {
            const tx = await this.provider?.getTransaction(contentOwnership.transactionHash);
            if (tx) {
              const receipt = await tx.wait();
              if (receipt && receipt.status === 1) {
                // Transaction confirmed on blockchain
                return {
                  success: true,
                  contentOwnership
                };
              }
            }
          } catch (error) {
            this.logger.warn(`Could not verify content ownership on blockchain: ${contentId}`, error);
          }
        }
        
        // Return local record even if blockchain verification fails
        return {
          success: true,
          contentOwnership
        };
      }
      
      // If not found locally, try to query from blockchain
      if (this.contract) {
        try {
          // This assumes the contract has a way to lookup content by ID
          // The implementation would depend on your contract structure
          const result = await this.contract.getContentByContentId(contentId);
          
          if (result && result.owner) {
            const contentOwnership: ContentOwnership = {
              contentId,
              owner: result.owner,
              title: result.title || 'Unknown',
              description: result.description,
              timestamp: result.timestamp ? result.timestamp.toNumber() : Math.floor(Date.now() / 1000),
            };
            
            // Store the record locally for future reference
            this.storeContentOwnership(contentOwnership);
            
            return {
              success: true,
              contentOwnership
            };
          }
        } catch (error) {
          this.logger.error(`Error querying content from blockchain: ${contentId}`, error);
        }
      }
      
      return {
        success: false,
        error: 'Content ownership record not found'
      };
    } catch (error) {
      this.logger.error('Error in getContentOwnership', error);
      return {
        success: false,
        error: `Failed to get content ownership: ${error}`
      };
    }
  }

  /**
   * Sign content with the owner's wallet
   */
  public async signContent(contentId: string, owner?: string): Promise<{success: boolean, signature?: string, error?: string}> {
    try {
      if (!this.wallet) {
        throw new Error('No wallet initialized. Cannot sign content.');
      }
      
      const signerAddress = owner || await this.wallet.getAddress();
      
      // Get content ownership record
      const ownershipResult = await this.getContentOwnership(contentId);
      if (!ownershipResult.success || !ownershipResult.contentOwnership) {
        return {
          success: false,
          error: 'Content ownership record not found'
        };
      }
      
      const contentOwnership = ownershipResult.contentOwnership;
      
      // Only the owner can sign
      if (contentOwnership.owner.toLowerCase() !== signerAddress.toLowerCase()) {
        return {
          success: false,
          error: 'Only the owner can sign content'
        };
      }
      
      // Create message to sign
      const message = ethers.utils.solidityKeccak256(
        ['string', 'address', 'string', 'string', 'uint256'],
        [
          contentOwnership.contentId,
          contentOwnership.owner,
          contentOwnership.title,
          contentOwnership.description || '',
          contentOwnership.timestamp
        ]
      );
      
      // Sign the message
      const messageHashBytes = ethers.utils.arrayify(message);
      const signature = await this.wallet.signMessage(messageHashBytes);
      
      // Update the content ownership record with the signature
      contentOwnership.signature = signature;
      this.storeContentOwnership(contentOwnership);
      
      this.logger.info(`Content signed: ${contentId}`);
      
      return {
        success: true,
        signature
      };
    } catch (error) {
      this.logger.error('Error in signContent', error);
      return {
        success: false,
        error: `Failed to sign content: ${error}`
      };
    }
  }

  /**
   * Verify content signature
   */
  public async verifyContentSignature(contentId: string, signature: string): Promise<{success: boolean, isValid: boolean, error?: string}> {
    try {
      if (!this.provider) {
        throw new Error('BlockchainService not initialized');
      }
      
      // Get content ownership record
      const ownershipResult = await this.getContentOwnership(contentId);
      if (!ownershipResult.success || !ownershipResult.contentOwnership) {
        return {
          success: false,
          isValid: false,
          error: 'Content ownership record not found'
        };
      }
      
      const contentOwnership = ownershipResult.contentOwnership;
      
      // Create message that was signed
      const message = ethers.utils.solidityKeccak256(
        ['string', 'address', 'string', 'string', 'uint256'],
        [
          contentOwnership.contentId,
          contentOwnership.owner,
          contentOwnership.title,
          contentOwnership.description || '',
          contentOwnership.timestamp
        ]
      );
      
      // Recover the signer address
      const messageHashBytes = ethers.utils.arrayify(message);
      try {
        const signerAddress = ethers.utils.verifyMessage(messageHashBytes, signature);
        
        // Check if the signer is the owner
        const isValid = signerAddress.toLowerCase() === contentOwnership.owner.toLowerCase();
        
        return {
          success: true,
          isValid
        };
      } catch (error) {
        return {
          success: false,
          isValid: false,
          error: 'Invalid signature'
        };
      }
    } catch (error) {
      this.logger.error('Error in verifyContentSignature', error);
      return {
        success: false,
        isValid: false,
        error: `Failed to verify content signature: ${error}`
      };
    }
  }

  /**
   * Send a tip to a content creator
   */
  public async tipCreator(creatorAddress: string, amount: string, streamId?: string, message?: string): Promise<{success: boolean, transaction?: BlockchainTransaction, error?: string}> {
    try {
      if (!this.isInitialized) {
        throw new Error('BlockchainService not initialized');
      }
      
      if (!this.wallet) {
        throw new Error('No wallet initialized. Cannot send tip.');
      }
      
      if (!this.contract) {
        throw new Error('No contract initialized. Cannot send tip.');
      }
      
      this.logger.info(`Sending tip to creator ${creatorAddress}: ${amount} ETH`);
      
      // Convert amount to wei
      const amountWei = ethers.utils.parseEther(amount);
      
      // Send the tip transaction
      const tx = await this.contract.tipCreator(creatorAddress, {
        value: amountWei
      });
      
      this.logger.info(`Tip transaction sent: ${tx.hash}`);
      
      // Wait for transaction confirmation
      const receipt = await tx.wait(1);
      
      if (receipt && receipt.status === 1) {
        this.logger.info(`Tip sent successfully: ${amount} ETH to ${creatorAddress}`);
        
        // Store tip record
        const tipRecord: StreamTip = {
          id: `tip-${Date.now()}`,
          streamId: streamId || 'unknown',
          sender: await this.wallet.getAddress(),
          recipient: creatorAddress,
          amount,
          currency: 'ETH',
          message,
          timestamp: Math.floor(Date.now() / 1000),
          transactionHash: tx.hash
        };
        
        this.storeTipRecord(tipRecord);
        
        return {
          success: true,
          transaction: {
            hash: tx.hash,
            confirmations: 1
          }
        };
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error) {
      this.logger.error('Error in tipCreator', error);
      return {
        success: false,
        error: `Failed to send tip: ${error}`
      };
    }
  }

  /**
   * Store tip record locally
   */
  private storeTipRecord(tipRecord: StreamTip): void {
    const filePath = path.join(this.storagePath, `tip-${tipRecord.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(tipRecord, null, 2));
  }

  /**
   * Create NFT for content
   */
  public async mintContentNFT(contentId: string, metadata: ContentNFTMetadata): Promise<{success: boolean, tokenId?: string, transaction?: BlockchainTransaction, error?: string}> {
    try {
      if (!this.isInitialized) {
        throw new Error('BlockchainService not initialized');
      }
      
      if (!this.wallet) {
        throw new Error('No wallet initialized. Cannot mint NFT.');
      }
      
      if (!this.contract) {
        throw new Error('No contract initialized. Cannot mint NFT.');
      }
      
      // First upload metadata to IPFS
      const metadataString = JSON.stringify(metadata);
      const metadataBuffer = Buffer.from(metadataString);
      const metadataCid = await this.ipfsService.addContent(metadataBuffer, 'metadata.json');
      const metadataUri = this.ipfsService.getGatewayUrl(metadataCid);
      
      this.logger.info(`Metadata uploaded to IPFS: ${metadataUri}`);
      
      // Mint the NFT
      const tx = await this.contract.mintNFT(contentId, metadataUri);
      
      this.logger.info(`NFT minting transaction sent: ${tx.hash}`);
      
      // Wait for transaction confirmation
      const receipt = await tx.wait(1);
        if (receipt && receipt.status === 1) {        // Extract token ID from event logs
        let tokenId;
        if (receipt.events) {
          const nftMintedEvent = receipt.events.find((event: {event: string, args?: any}) => event.event === 'NFTMinted');
          if (nftMintedEvent && nftMintedEvent.args) {
            tokenId = nftMintedEvent.args.tokenId.toString();
          }
        }
        
        if (!tokenId) {
          tokenId = await this.contract.contentToNFT(contentId);
          tokenId = tokenId.toString();
        }
        
        this.logger.info(`NFT minted successfully for content ${contentId}: Token ID ${tokenId}`);
        
        return {
          success: true,
          tokenId,
          transaction: {
            hash: tx.hash,
            confirmations: 1
          }
        };
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error) {
      this.logger.error('Error in mintContentNFT', error);
      return {
        success: false,
        error: `Failed to mint NFT: ${error}`
      };
    }
  }

  /**
   * Get the status of the blockchain service
   */
  public getStatus(): { 
    initialized: boolean;
    network?: string;
    chainId?: number;
    address?: string;
    readOnly: boolean;
  } {
    const address = this.wallet ? this.wallet.address : undefined;
    
    return {
      initialized: this.isInitialized,
      network: this.currentNetwork?.name,
      chainId: this.currentNetwork?.chainId,
      address,
      readOnly: !this.wallet
    };
  }

  /**
   * Get all tips sent to a creator
   */
  public async getCreatorTips(creatorAddress: string): Promise<StreamTip[]> {
    const tips: StreamTip[] = [];
    
    // Read tip files from storage
    const files = fs.readdirSync(this.storagePath);
    for (const file of files) {
      if (file.startsWith('tip-')) {
        try {
          const filePath = path.join(this.storagePath, file);
          const tipRecord = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          
          if (tipRecord.recipient.toLowerCase() === creatorAddress.toLowerCase()) {
            tips.push(tipRecord);
          }
        } catch (error) {
          this.logger.error(`Error reading tip record: ${file}`, error);
        }
      }
    }
    
    // Sort by timestamp, newest first
    tips.sort((a, b) => b.timestamp - a.timestamp);
    
    return tips;
  }
}
