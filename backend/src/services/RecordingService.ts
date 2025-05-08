import * as fs from 'fs';
import * as path from 'path';
import { LoggerService } from './LoggerService';
import { IPFSService } from './IPFSService';
import ipfsConfig from '../config/ipfsConfig';

/**
 * Interface for recording data
 */
interface Recording {
  filename: string;
  path: string;
  size: number;
  createdAt: string;
  ipfsData?: {
    cid: string;
    url: string;
    dateUploaded: string;
  };
}

/**
 * Interface for recording operation result
 */
interface RecordingResult {
  success: boolean;
  error?: string;
  recording?: Recording;
  cid?: string;
  url?: string;
  ipfsData?: {
    cid: string;
    url: string;
    dateUploaded: string;
  };
  recordingPath?: string;
}

/**
 * Service for handling recordings and IPFS integration
 */
export class RecordingService {
  private logger: LoggerService;
  private ipfsService: IPFSService;
  private recordingsDir: string;

  constructor(logger: LoggerService, ipfsService: IPFSService) {
    this.logger = logger;
    this.ipfsService = ipfsService;
    this.recordingsDir = path.join(process.cwd(), 'media', 'recordings');

    // Ensure recordings directory exists
    if (!fs.existsSync(this.recordingsDir)) {
      fs.mkdirSync(this.recordingsDir, { recursive: true });
    }
  }

  /**
   * Get all recordings
   */
  public getRecordings(): Recording[] {
    try {
      this.logger.info('Getting recordings list');
      
      // Ensure directory exists
      if (!fs.existsSync(this.recordingsDir)) {
        fs.mkdirSync(this.recordingsDir, { recursive: true });
        return [];
      }
      
      // Get files in directory
      const files = fs.readdirSync(this.recordingsDir);
      
      // Parse recording metadata
      const recordings: Recording[] = [];
      
      for (const file of files) {
        if (file.endsWith('.mp4')) {
          const filePath = path.join(this.recordingsDir, file);
          const stats = fs.statSync(filePath);
          
          // Check if we have metadata file
          const metadataPath = path.join(this.recordingsDir, `${file}.meta.json`);
          let ipfsData = undefined;
          
          if (fs.existsSync(metadataPath)) {
            try {
              const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
              ipfsData = metadata.ipfsData;
            } catch (error) {
              this.logger.error(`Failed to parse metadata for ${file}`, error);
            }
          }
          
          recordings.push({
            filename: file,
            path: filePath,
            size: stats.size,
            createdAt: stats.birthtime.toISOString(),
            ipfsData
          });
        }
      }
      
      // Sort by creation date (newest first)
      recordings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      return recordings;
    } catch (error) {
      this.logger.error('Error getting recordings', error);
      return [];
    }
  }
  
  /**
   * Configure recording for a stream
   * @param streamPath Stream path
   */
  public configureRecording(streamPath: string): RecordingResult {
    try {
      // Extract stream key from path
      const streamKey = streamPath.split('/').pop();
      
      if (!streamKey) {
        return {
          success: false,
          error: 'Invalid stream path'
        };
      }
      
      // Generate filename based on stream key and timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${streamKey}-${timestamp}.mp4`;
      const recordingPath = path.join(this.recordingsDir, fileName);
      
      this.logger.info(`Configured recording for stream ${streamPath} at ${recordingPath}`);
      
      return {
        success: true,
        recordingPath
      };
    } catch (error) {
      this.logger.error('Error configuring recording', error);
      return {
        success: false,
        error: `Failed to configure recording: ${error}`
      };
    }
  }
  
  /**
   * Handle recording completion and optionally upload to IPFS
   * @param recordingPath Path to the recording file
   * @param autoUploadToIPFS Whether to automatically upload to IPFS
   */
  public async handleRecordingComplete(
    recordingPath: string,
    autoUploadToIPFS: boolean = ipfsConfig.recording.autoUpload
  ): Promise<RecordingResult> {
    try {
      this.logger.info(`Recording completed: ${recordingPath}`);
      
      // Check if file exists
      if (!fs.existsSync(recordingPath)) {
        return {
          success: false,
          error: `Recording file not found: ${recordingPath}`
        };
      }
      
      const fileName = path.basename(recordingPath);
      const stats = fs.statSync(recordingPath);
      
      // Create recording object
      const recording: Recording = {
        filename: fileName,
        path: recordingPath,
        size: stats.size,
        createdAt: stats.birthtime.toISOString()
      };
      
      // Auto upload to IPFS if configured
      if (autoUploadToIPFS) {
        this.logger.info(`Auto-uploading recording to IPFS: ${fileName}`);
        return await this.uploadToIPFS(fileName);
      }
      
      return {
        success: true,
        recording
      };
    } catch (error) {
      this.logger.error('Error handling recording completion', error);
      return {
        success: false,
        error: `Failed to handle recording completion: ${error}`
      };
    }
  }
  
  /**
   * Upload a recording to IPFS
   * @param fileName Name of the recording file
   */
  public async uploadToIPFS(fileName: string): Promise<RecordingResult> {
    try {
      this.logger.info(`Uploading recording to IPFS: ${fileName}`);
      
      const recordingPath = path.join(this.recordingsDir, fileName);
      
      // Check if file exists
      if (!fs.existsSync(recordingPath)) {
        return {
          success: false,
          error: `Recording file not found: ${fileName}`
        };
      }
      
      // Add to IPFS
      const cid = await this.ipfsService.addFile(recordingPath);
      const url = this.ipfsService.getGatewayUrl(cid);
      
      // Create metadata
      const stats = fs.statSync(recordingPath);
      const ipfsData = {
        cid,
        url,
        dateUploaded: new Date().toISOString()
      };
      
      // Save metadata
      const metadataPath = path.join(this.recordingsDir, `${fileName}.meta.json`);
      fs.writeFileSync(metadataPath, JSON.stringify({
        filename: fileName,
        path: recordingPath,
        size: stats.size,
        createdAt: stats.birthtime.toISOString(),
        ipfsData
      }, null, 2));
      
      this.logger.info(`Recording uploaded to IPFS: ${fileName}`, { cid, url });
      
      // If configured to not keep local after IPFS upload, delete the local file
      if (!ipfsConfig.recording.keepLocal) {
        fs.unlinkSync(recordingPath);
        this.logger.info(`Deleted local recording after IPFS upload: ${fileName}`);
      }
      
      return {
        success: true,
        cid,
        url,
        ipfsData
      };
    } catch (error) {
      this.logger.error(`Failed to upload recording to IPFS: ${fileName}`, error);
      return {
        success: false,
        error: `Failed to upload to IPFS: ${error}`
      };
    }
  }
  
  /**
   * Delete a recording
   * @param fileName Name of the recording file
   */
  public deleteRecording(fileName: string): RecordingResult {
    try {
      this.logger.info(`Deleting recording: ${fileName}`);
      
      const recordingPath = path.join(this.recordingsDir, fileName);
      const metadataPath = path.join(this.recordingsDir, `${fileName}.meta.json`);
      
      // Check if file exists
      if (!fs.existsSync(recordingPath)) {
        return {
          success: false,
          error: `Recording file not found: ${fileName}`
        };
      }
      
      // Delete the recording file
      fs.unlinkSync(recordingPath);
      
      // Delete metadata if it exists
      if (fs.existsSync(metadataPath)) {
        fs.unlinkSync(metadataPath);
      }
      
      this.logger.info(`Recording deleted: ${fileName}`);
      
      return {
        success: true
      };
    } catch (error) {
      this.logger.error(`Failed to delete recording: ${fileName}`, error);
      return {
        success: false,
        error: `Failed to delete recording: ${error}`
      };
    }
  }
}