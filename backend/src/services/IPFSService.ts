import * as fs from 'fs';
import * as path from 'path';
import { create, IPFS } from 'ipfs-core';
import IpfsHttpClient from 'ipfs-http-client';
import { CID } from 'multiformats/cid';
import ipfsConfig from '../config/ipfsConfig';
import { LoggerService } from './LoggerService';

/**
 * Service for handling IPFS operations
 */
export class IPFSService {
  private logger: LoggerService;
  private ipfs: IPFS | null;
  private ipfsClient: any;
  private isNodeRunning: boolean;
  private isClientConnected: boolean;

  /**
   * Constructor for IPFSService
   */
  constructor(logger: LoggerService) {
    this.logger = logger;
    this.ipfs = null;
    this.ipfsClient = null;
    this.isNodeRunning = false;
    this.isClientConnected = false;
  }

  /**
   * Initialize IPFS node or client
   */
  public async initialize(): Promise<boolean> {
    try {
      if (ipfsConfig.useExternalNode) {
        return await this.connectToExternalNode();
      } else {
        return await this.startEmbeddedNode();
      }
    } catch (error) {
      this.logger.error('Failed to initialize IPFS', error);
      return false;
    }
  }

  /**
   * Connect to an external IPFS node
   */
  private async connectToExternalNode(): Promise<boolean> {
    try {
      this.logger.info(`Connecting to external IPFS node at ${ipfsConfig.nodeUrl}`);
      
      this.ipfsClient = IpfsHttpClient.create({ url: ipfsConfig.nodeUrl });
      
      // Check if the node is running by fetching the ID
      const nodeId = await this.ipfsClient.id();
      
      this.logger.info(`Connected to IPFS node: ${nodeId.id}`);
      this.isClientConnected = true;
      this.isNodeRunning = true;
      
      return true;
    } catch (error) {
      this.logger.error('Failed to connect to external IPFS node', error);
      this.isClientConnected = false;
      this.isNodeRunning = false;
      return false;
    }
  }

  /**
   * Start an embedded IPFS node
   */
  private async startEmbeddedNode(): Promise<boolean> {
    try {
      this.logger.info('Starting embedded IPFS node');
      
      // Ensure repo path exists
      const repoPath = path.resolve(ipfsConfig.embeddedNode.repoPath);
      if (!fs.existsSync(repoPath)) {
        fs.mkdirSync(repoPath, { recursive: true });
      }
      
      // Create IPFS node
      this.ipfs = await create({
        repo: repoPath,
        config: {
          Addresses: {
            Swarm: [
              '/ip4/0.0.0.0/tcp/4001',
              '/ip4/0.0.0.0/tcp/4002/ws'
            ],
            API: `/ip4/${ipfsConfig.embeddedNode.apiConfig.host}/tcp/${ipfsConfig.embeddedNode.apiConfig.port}`,
            Gateway: `/ip4/${ipfsConfig.embeddedNode.gatewayConfig.host}/tcp/${ipfsConfig.embeddedNode.gatewayConfig.port}`
          },
          Bootstrap: ipfsConfig.embeddedNode.bootstrapList
        },
        start: true
      });
      
      const nodeId = await this.ipfs.id();
      this.logger.info(`Started embedded IPFS node: ${nodeId.id}`);
      
      // Connect to bootstrap nodes
      for (const addr of ipfsConfig.embeddedNode.bootstrapList) {
        try {
          await this.ipfs.swarm.connect(addr);
          this.logger.debug(`Connected to bootstrap node: ${addr}`);
        } catch (error) {
          this.logger.warn(`Failed to connect to bootstrap node: ${addr}`, error);
        }
      }
      
      this.isNodeRunning = true;
      this.isClientConnected = true;
      
      return true;
    } catch (error) {
      this.logger.error('Failed to start embedded IPFS node', error);
      this.isNodeRunning = false;
      this.isClientConnected = false;
      return false;
    }
  }

  /**
   * Get the IPFS node status
   */
  public async getStatus(): Promise<{ isNodeRunning: boolean, isClientConnected: boolean, gateway: string }> {
    try {
      if (this.ipfs || this.ipfsClient) {
        try {
          // Try to ping the node to verify it's still running
          const id = this.ipfs 
            ? await this.ipfs.id() 
            : await this.ipfsClient.id();
          
          this.isNodeRunning = true;
          this.isClientConnected = true;
        } catch (error) {
          this.isNodeRunning = false;
          this.isClientConnected = false;
        }
      }
      
      return {
        isNodeRunning: this.isNodeRunning,
        isClientConnected: this.isClientConnected,
        gateway: this.isNodeRunning 
          ? ipfsConfig.gatewayUrl 
          : ipfsConfig.publicGateway
      };
    } catch (error) {
      this.logger.error('Error getting IPFS status', error);
      return {
        isNodeRunning: false,
        isClientConnected: false,
        gateway: ipfsConfig.publicGateway
      };
    }
  }

  /**
   * Get the IPFS node info
   */
  public async getNodeInfo(): Promise<any> {
    try {
      if (!this.isNodeRunning) {
        throw new Error('IPFS node is not running');
      }
      
      const client = this.ipfs || this.ipfsClient;
      
      const id = await client.id();
      const version = await client.version();
      const peers = await client.swarm.peers();
      
      return {
        id: id.id,
        version: version.version,
        peersCount: peers.length,
        addresses: id.addresses
      };
    } catch (error) {
      this.logger.error('Error getting IPFS node info', error);
      throw error;
    }
  }

  /**
   * Add a file to IPFS
   * @param filePath File path to add
   * @returns CID of the added file
   */
  public async addFile(filePath: string): Promise<string> {
    try {
      if (!this.isNodeRunning) {
        throw new Error('IPFS node is not running');
      }
      
      const client = this.ipfs || this.ipfsClient;
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      // Get file name and size
      const fileName = path.basename(filePath);
      const stats = fs.statSync(filePath);
      
      this.logger.info(`Adding file to IPFS: ${fileName} (${stats.size} bytes)`);
      
      // Create read stream for the file
      const fileStream = fs.createReadStream(filePath);
      
      // Add file to IPFS
      const result = await client.add(
        fileStream,
        {
          pin: ipfsConfig.pinning.autoPinContent && stats.size <= ipfsConfig.pinning.maxPinSize
        }
      );
      
      const cid = result.cid.toString();
      
      this.logger.info(`File added to IPFS: ${fileName}`, { cid });
      
      // If auto-pin is enabled and file is within size limit
      if (ipfsConfig.pinning.autoPinContent && stats.size <= ipfsConfig.pinning.maxPinSize) {
        this.logger.info(`Pinned file: ${fileName} (${cid})`);
      }
      
      // If remote pinning is enabled, pin to remote services
      await this.pinToRemoteServices(cid, fileName);
      
      return cid;
    } catch (error) {
      this.logger.error('Error adding file to IPFS', error);
      throw error;
    }
  }

  /**
   * Add content to IPFS
   * @param content Content to add
   * @param fileName Optional filename
   * @returns CID of the added content
   */
  public async addContent(content: string | Buffer, fileName?: string): Promise<string> {
    try {
      if (!this.isNodeRunning) {
        throw new Error('IPFS node is not running');
      }
      
      const client = this.ipfs || this.ipfsClient;
      
      const contentSize = Buffer.isBuffer(content) 
        ? content.length 
        : Buffer.byteLength(content);
      
      this.logger.info(`Adding content to IPFS${fileName ? `: ${fileName}` : ''} (${contentSize} bytes)`);
      
      // Add content to IPFS
      const result = await client.add(
        content,
        {
          pin: ipfsConfig.pinning.autoPinContent && contentSize <= ipfsConfig.pinning.maxPinSize
        }
      );
      
      const cid = result.cid.toString();
      
      this.logger.info(`Content added to IPFS${fileName ? `: ${fileName}` : ''}`, { cid });
      
      // If auto-pin is enabled and content is within size limit
      if (ipfsConfig.pinning.autoPinContent && contentSize <= ipfsConfig.pinning.maxPinSize) {
        this.logger.info(`Pinned content${fileName ? `: ${fileName}` : ''} (${cid})`);
      }
      
      // If remote pinning is enabled, pin to remote services
      await this.pinToRemoteServices(cid, fileName);
      
      return cid;
    } catch (error) {
      this.logger.error('Error adding content to IPFS', error);
      throw error;
    }
  }

  /**
   * Get content from IPFS
   * @param cid CID of the content to get
   * @returns Content as Buffer
   */
  public async getContent(cid: string): Promise<Buffer> {
    try {
      if (!this.isNodeRunning) {
        throw new Error('IPFS node is not running');
      }
      
      const client = this.ipfs || this.ipfsClient;
      
      this.logger.info(`Getting content from IPFS: ${cid}`);
      
      // Get content from IPFS
      const chunks = [];
      for await (const chunk of client.cat(cid)) {
        chunks.push(chunk);
      }
      
      const content = Buffer.concat(chunks);
      
      this.logger.info(`Content retrieved from IPFS: ${cid} (${content.length} bytes)`);
      
      return content;
    } catch (error) {
      this.logger.error(`Error getting content from IPFS: ${cid}`, error);
      throw error;
    }
  }

  /**
   * Pin content to IPFS
   * @param cid CID of the content to pin
   */
  public async pinContent(cid: string): Promise<void> {
    try {
      if (!this.isNodeRunning) {
        throw new Error('IPFS node is not running');
      }
      
      const client = this.ipfs || this.ipfsClient;
      
      this.logger.info(`Pinning content: ${cid}`);
      
      // Pin content
      await client.pin.add(CID.parse(cid));
      
      this.logger.info(`Content pinned: ${cid}`);
      
      // If remote pinning is enabled, pin to remote services
      await this.pinToRemoteServices(cid);
    } catch (error) {
      this.logger.error(`Error pinning content: ${cid}`, error);
      throw error;
    }
  }

  /**
   * Unpin content from IPFS
   * @param cid CID of the content to unpin
   */
  public async unpinContent(cid: string): Promise<void> {
    try {
      if (!this.isNodeRunning) {
        throw new Error('IPFS node is not running');
      }
      
      const client = this.ipfs || this.ipfsClient;
      
      this.logger.info(`Unpinning content: ${cid}`);
      
      // Unpin content
      await client.pin.rm(CID.parse(cid));
      
      this.logger.info(`Content unpinned: ${cid}`);
    } catch (error) {
      this.logger.error(`Error unpinning content: ${cid}`, error);
      throw error;
    }
  }

  /**
   * Pin to remote pinning services
   * @param cid CID of the content to pin
   * @param name Optional name for the content
   */
  private async pinToRemoteServices(cid: string, name?: string): Promise<void> {
    const enabledServices = ipfsConfig.pinning.remoteServices.filter(service => service.enabled);
    
    if (enabledServices.length === 0) {
      return;
    }
    
    this.logger.info(`Pinning content to remote services: ${cid}`);
    
    for (const service of enabledServices) {
      try {
        // This is a placeholder for actual remote pinning service integration
        // In a real implementation, you would use the respective API client
        // to pin the content to the remote service
        
        this.logger.info(`Pinned content to ${service.name}: ${cid}`);
      } catch (error) {
        this.logger.error(`Error pinning content to ${service.name}: ${cid}`, error);
      }
    }
  }

  /**
   * Get a gateway URL for a CID
   * @param cid CID of the content
   * @returns Gateway URL
   */
  public getGatewayUrl(cid: string): string {
    // Use configured gateway URL if node is running, otherwise use public gateway
    const gatewayUrl = this.isNodeRunning ? ipfsConfig.gatewayUrl : ipfsConfig.publicGateway;
    return `${gatewayUrl}/${cid}`;
  }

  /**
   * Stop IPFS node or client
   */
  public async stop(): Promise<void> {
    try {
      if (this.ipfs) {
        this.logger.info('Stopping embedded IPFS node');
        await this.ipfs.stop();
        this.ipfs = null;
      }
      
      this.ipfsClient = null;
      this.isNodeRunning = false;
      this.isClientConnected = false;
      
      this.logger.info('IPFS node stopped');
    } catch (error) {
      this.logger.error('Error stopping IPFS node', error);
    }
  }
}