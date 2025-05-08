import { create, IPFSHTTPClient } from 'ipfs-http-client';
import * as fs from 'fs';
import * as path from 'path';
import * as IPFS from 'ipfs-core';
import { LoggerService } from './LoggerService';

/**
 * Service for handling IPFS integration
 * Allows for decentralized storage of video streams
 */
export class IPFSService {
  private ipfsClient: IPFSHTTPClient | null = null;
  private ipfsNode: IPFS.IPFS | null = null;
  private logger: LoggerService;
  private isNodeRunning: boolean = false;
  private isClientConnected: boolean = false;
  private ipfsGateway: string = 'https://ipfs.io/ipfs/';
  private storagePath: string;

  constructor(logger: LoggerService) {
    this.logger = logger;
    this.storagePath = path.join(process.cwd(), 'media', 'ipfs-storage');
    
    // Create storage directory if it doesn't exist
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  /**
   * Initialize IPFS client connection to external node
   */
  async connectToExternalNode(apiUrl: string = 'http://localhost:5001'): Promise<boolean> {
    try {
      this.logger.info('Connecting to external IPFS node', { apiUrl });
      this.ipfsClient = create({ url: apiUrl });
      
      // Test connection by getting node ID
      const id = await this.ipfsClient.id();
      this.isClientConnected = true;
      this.logger.info('Connected to external IPFS node', { 
        id: id.id,
        agentVersion: id.agentVersion
      });
      return true;
    } catch (error) {
      this.isClientConnected = false;
      this.logger.error('Failed to connect to external IPFS node', error);
      return false;
    }
  }

  /**
   * Start an embedded IPFS node
   */
  async startEmbeddedNode(): Promise<boolean> {
    try {
      this.logger.info('Starting embedded IPFS node');
      
      // Initialize the IPFS node with custom configuration
      this.ipfsNode = await IPFS.create({
        repo: path.join(this.storagePath, '.ipfs'),
        config: {
          Addresses: {
            Swarm: [
              '/ip4/0.0.0.0/tcp/4002',
              '/ip4/0.0.0.0/tcp/4003/ws',
            ],
            API: '/ip4/0.0.0.0/tcp/5002',
            Gateway: '/ip4/0.0.0.0/tcp/9090'
          },
          Bootstrap: [
            '/dns4/ipfs.io/tcp/443/wss/p2p/QmSoLer265NRgSp2LA3dPaeykiS1J6DifTC88f5uVQKNAd',
            '/dns4/1.pubsub.aira.life/tcp/443/wss/ipfs/QmdfTbBqBPQ7VNxZEYEj14VmRuZBkqFbiwReogJgS1zR1n',
          ]
        }
      });
      
      // Get node ID
      const id = await this.ipfsNode.id();
      this.isNodeRunning = true;
      this.logger.info('Started embedded IPFS node', { id: id.id });
      return true;
    } catch (error) {
      this.isNodeRunning = false;
      this.logger.error('Failed to start embedded IPFS node', error);
      return false;
    }
  }

  /**
   * Upload file to IPFS
   * @param filePath Path to the file
   * @param options Optional configuration options
   * @returns CID of the uploaded file
   */
  async addFile(filePath: string, options: { pin?: boolean } = { pin: true }): Promise<string> {
    try {
      // Check if we have an active IPFS connection
      if (!this.ipfsClient && !this.ipfsNode) {
        throw new Error('No IPFS connection available');
      }
      
      this.logger.info('Adding file to IPFS', { filePath });
      
      // Read file as buffer
      const fileBuffer = fs.readFileSync(filePath);
      
      // Use embedded node or client to add the file
      const ipfs = this.ipfsNode || this.ipfsClient;
      
      if (!ipfs) {
        throw new Error('No IPFS instance available');
      }
      
      // Add the file to IPFS
      const result = await ipfs.add(fileBuffer, { pin: options.pin });
      
      this.logger.info('File added to IPFS', { 
        cid: result.cid.toString(), 
        size: result.size 
      });
      
      return result.cid.toString();
    } catch (error) {
      this.logger.error('Failed to add file to IPFS', error);
      throw error;
    }
  }

  /**
   * Upload data buffer to IPFS
   * @param data Buffer or string data to upload
   * @param options Optional configuration options
   * @returns CID of the uploaded content
   */
  async addData(data: Buffer | string, options: { pin?: boolean, filename?: string } = { pin: true }): Promise<string> {
    try {
      // Check if we have an active IPFS connection
      if (!this.ipfsClient && !this.ipfsNode) {
        throw new Error('No IPFS connection available');
      }
      
      // Use embedded node or client to add the data
      const ipfs = this.ipfsNode || this.ipfsClient;
      
      if (!ipfs) {
        throw new Error('No IPFS instance available');
      }

      // Convert string to buffer if needed
      const buffer = typeof data === 'string' ? Buffer.from(data) : data;
      
      // Add the data to IPFS
      const result = await ipfs.add(buffer, { pin: options.pin });
      
      this.logger.info('Data added to IPFS', { 
        cid: result.cid.toString(), 
        size: result.size,
        filename: options.filename
      });
      
      // If filename is provided, save content metadata
      if (options.filename) {
        const metadata = {
          cid: result.cid.toString(),
          filename: options.filename,
          size: result.size,
          dateAdded: new Date().toISOString()
        };
        
        const metadataPath = path.join(this.storagePath, 'metadata');
        if (!fs.existsSync(metadataPath)) {
          fs.mkdirSync(metadataPath, { recursive: true });
        }
        
        fs.writeFileSync(
          path.join(metadataPath, `${result.cid.toString()}.json`), 
          JSON.stringify(metadata, null, 2)
        );
      }
      
      return result.cid.toString();
    } catch (error) {
      this.logger.error('Failed to add data to IPFS', error);
      throw error;
    }
  }

  /**
   * Get content from IPFS by CID
   * @param cid Content identifier
   * @returns Buffer containing the content
   */
  async getContent(cid: string): Promise<Buffer> {
    try {
      // Check if we have an active IPFS connection
      if (!this.ipfsClient && !this.ipfsNode) {
        throw new Error('No IPFS connection available');
      }
      
      this.logger.info('Retrieving content from IPFS', { cid });
      
      // Use embedded node or client to get the content
      const ipfs = this.ipfsNode || this.ipfsClient;
      
      if (!ipfs) {
        throw new Error('No IPFS instance available');
      }
      
      // Get the content from IPFS
      const chunks: Uint8Array[] = [];
      
      for await (const chunk of ipfs.cat(cid)) {
        chunks.push(chunk);
      }
      
      // Combine chunks into a single buffer
      const content = Buffer.concat(chunks);
      
      this.logger.info('Content retrieved from IPFS', { 
        cid, 
        size: content.length 
      });
      
      return content;
    } catch (error) {
      this.logger.error('Failed to get content from IPFS', error);
      throw error;
    }
  }

  /**
   * Pin content to ensure it's kept in the IPFS node
   * @param cid Content identifier to pin
   */
  async pinContent(cid: string): Promise<void> {
    try {
      // Check if we have an active IPFS connection
      if (!this.ipfsClient && !this.ipfsNode) {
        throw new Error('No IPFS connection available');
      }
      
      this.logger.info('Pinning content to IPFS', { cid });
      
      // Use embedded node or client to pin the content
      const ipfs = this.ipfsNode || this.ipfsClient;
      
      if (!ipfs) {
        throw new Error('No IPFS instance available');
      }
      
      // Pin the content
      await ipfs.pin.add(cid);
      
      this.logger.info('Content pinned to IPFS', { cid });
    } catch (error) {
      this.logger.error('Failed to pin content to IPFS', error);
      throw error;
    }
  }

  /**
   * Get the IPFS gateway URL for a CID
   * @param cid Content identifier
   * @returns Gateway URL
   */
  getGatewayUrl(cid: string): string {
    return `${this.ipfsGateway}${cid}`;
  }

  /**
   * Set a custom IPFS gateway URL
   * @param gatewayUrl New gateway URL
   */
  setGateway(gatewayUrl: string): void {
    this.ipfsGateway = gatewayUrl;
    this.logger.info('IPFS gateway updated', { gateway: gatewayUrl });
  }

  /**
   * Stop the embedded IPFS node
   */
  async stop(): Promise<void> {
    try {
      if (this.ipfsNode && this.isNodeRunning) {
        this.logger.info('Stopping embedded IPFS node');
        await this.ipfsNode.stop();
        this.ipfsNode = null;
        this.isNodeRunning = false;
        this.logger.info('IPFS node stopped');
      }
      
      if (this.ipfsClient && this.isClientConnected) {
        this.ipfsClient = null;
        this.isClientConnected = false;
      }
    } catch (error) {
      this.logger.error('Failed to stop IPFS node', error);
    }
  }

  /**
   * Get status information about IPFS connections
   */
  getStatus(): { isNodeRunning: boolean, isClientConnected: boolean } {
    return {
      isNodeRunning: this.isNodeRunning,
      isClientConnected: this.isClientConnected
    };
  }
}