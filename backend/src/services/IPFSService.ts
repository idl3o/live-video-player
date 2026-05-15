import * as fs from 'fs';
import * as path from 'path';
import { createHelia, type HeliaLibp2p } from 'helia';
import { unixfs, type UnixFS } from '@helia/unixfs';
import { CID } from 'multiformats/cid';
import { FsBlockstore } from 'blockstore-fs';
import { FsDatastore } from 'datastore-fs';
import ipfsConfig from '../config/ipfsConfig';
import { LoggerService } from './LoggerService';

interface IPFSStatus {
  isNodeRunning: boolean;
  gateway: string;
}

export class IPFSService {
  private logger: LoggerService;
  private helia: HeliaLibp2p | null = null;
  private fs: UnixFS | null = null;
  private isNodeRunning = false;

  constructor(logger: LoggerService) {
    this.logger = logger;
  }

  public async initialize(): Promise<boolean> {
    try {
      const repoPath = path.resolve(ipfsConfig.embeddedNode.repoPath);
      const blockstorePath = path.join(repoPath, 'blocks');
      const datastorePath = path.join(repoPath, 'data');

      for (const dir of [blockstorePath, datastorePath]) {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      }

      this.helia = await createHelia({
        blockstore: new FsBlockstore(blockstorePath),
        datastore: new FsDatastore(datastorePath),
      });
      this.fs = unixfs(this.helia);
      this.isNodeRunning = true;

      const peerId = this.helia.libp2p.peerId.toString();
      this.logger.info(`Helia node started: ${peerId}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to start Helia node', error);
      this.isNodeRunning = false;
      return false;
    }
  }

  public getStatus(): IPFSStatus {
    return {
      isNodeRunning: this.isNodeRunning,
      gateway: this.isNodeRunning ? ipfsConfig.gatewayUrl : ipfsConfig.publicGateway,
    };
  }

  public async getNodeInfo() {
    this.assertRunning();
    const peers = this.helia!.libp2p.getPeers();
    const addresses = this.helia!.libp2p.getMultiaddrs();
    return {
      id: this.helia!.libp2p.peerId.toString(),
      version: 'helia',
      peersCount: peers.length,
      addresses: addresses.map((addr) => addr.toString()),
    };
  }

  public async addFile(filePath: string): Promise<string> {
    this.assertRunning();
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const bytes = fs.readFileSync(filePath);
    const cid = await this.fs!.addBytes(bytes);
    const cidStr = cid.toString();
    this.logger.info(`Added file to IPFS: ${path.basename(filePath)} (${bytes.length} bytes) → ${cidStr}`);
    return cidStr;
  }

  public async addContent(content: string | Buffer, label?: string): Promise<string> {
    this.assertRunning();
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const cid = await this.fs!.addBytes(buf);
    const cidStr = cid.toString();
    this.logger.info(`Added content to IPFS${label ? ` (${label})` : ''}: ${buf.length} bytes → ${cidStr}`);
    return cidStr;
  }

  public async getContent(cidStr: string): Promise<Buffer> {
    this.assertRunning();
    const cid = CID.parse(cidStr);
    const chunks: Uint8Array[] = [];
    for await (const chunk of this.fs!.cat(cid)) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  public async pinContent(cidStr: string): Promise<void> {
    this.assertRunning();
    const cid = CID.parse(cidStr);
    // Helia keeps blocks until GC runs; explicitly add to the pin set.
    for await (const _ of this.helia!.pins.add(cid)) {
      // drain
    }
    this.logger.info(`Pinned ${cidStr}`);
  }

  public async unpinContent(cidStr: string): Promise<void> {
    this.assertRunning();
    const cid = CID.parse(cidStr);
    for await (const _ of this.helia!.pins.rm(cid)) {
      // drain
    }
    this.logger.info(`Unpinned ${cidStr}`);
  }

  public getGatewayUrl(cid: string): string {
    const base = this.isNodeRunning ? ipfsConfig.gatewayUrl : ipfsConfig.publicGateway;
    return `${base}/${cid}`;
  }

  public async stop(): Promise<void> {
    if (!this.helia) return;
    this.logger.info('Stopping Helia node');
    await this.helia.stop();
    this.helia = null;
    this.fs = null;
    this.isNodeRunning = false;
  }

  private assertRunning(): void {
    if (!this.isNodeRunning || !this.helia || !this.fs) {
      throw new Error('Helia node is not running');
    }
  }
}
