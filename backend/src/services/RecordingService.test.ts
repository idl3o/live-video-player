import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RecordingService } from './RecordingService.js';
import { LoggerService } from './LoggerService.js';

// Minimal IPFSService stub — only the methods RecordingService actually calls.
class FakeIPFS {
  uploaded: string[] = [];
  storacha: string[] = [];

  async addFile(filePath: string): Promise<string> {
    this.uploaded.push(filePath);
    return 'bafyfakecid';
  }

  getGatewayUrl(cid: string): string {
    return `http://local-gw/${cid}`;
  }

  async uploadToStoracha(filePath: string) {
    this.storacha.push(filePath);
    return null; // simulate Storacha disabled
  }
}

describe('RecordingService', () => {
  let logger: LoggerService;
  let ipfs: FakeIPFS;
  let service: RecordingService;
  let workdir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    // macOS tmpdir is a symlink; realpath ensures path comparisons match
    // the canonical form RecordingService produces via process.cwd().
    workdir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lvp-rec-')));
    process.chdir(workdir);
    logger = new LoggerService('Test');
    ipfs = new FakeIPFS();
    service = new RecordingService(logger, ipfs as any);
  });

  it('configureRecording derives a timestamped path under media/recordings', () => {
    const result = service.configureRecording('/live/abc123');
    expect(result.success).toBe(true);
    expect(result.recordingPath).toMatch(/abc123-\d{4}-\d{2}-\d{2}T.+\.mp4$/);
    expect(result.recordingPath!).toContain(path.join(workdir, 'media', 'recordings'));
    process.chdir(originalCwd);
  });

  it('handleRecordingComplete returns error for a missing file', async () => {
    const result = await service.handleRecordingComplete('/does/not/exist.mp4');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
    process.chdir(originalCwd);
  });

  it('handleRecordingComplete with autoUpload=false skips IPFS', async () => {
    const filePath = path.join(workdir, 'media', 'recordings', 'fake.mp4');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'not real video');

    const result = await service.handleRecordingComplete(filePath, false);
    expect(result.success).toBe(true);
    expect(ipfs.uploaded).toHaveLength(0);
    process.chdir(originalCwd);
  });

  it('uploadToIPFS adds to local Helia and writes a metadata sidecar', async () => {
    const filePath = path.join(workdir, 'media', 'recordings', 'fake.mp4');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'not real video');

    const result = await service.uploadToIPFS('fake.mp4');
    expect(result.success).toBe(true);
    expect(result.cid).toBe('bafyfakecid');
    expect(ipfs.uploaded).toContain(filePath);
    expect(fs.existsSync(`${filePath}.meta.json`)).toBe(true);
    process.chdir(originalCwd);
  });

  it('getRecordings lists mp4 files with parsed metadata when present', async () => {
    const dir = path.join(workdir, 'media', 'recordings');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'one.mp4'), 'a');
    fs.writeFileSync(path.join(dir, 'two.mp4'), 'bb');
    fs.writeFileSync(
      path.join(dir, 'two.mp4.meta.json'),
      JSON.stringify({ ipfsData: { cid: 'cid2', url: 'u', dateUploaded: '2026-01-01' } })
    );

    const list = service.getRecordings();
    expect(list).toHaveLength(2);
    const two = list.find((r) => r.filename === 'two.mp4');
    expect(two?.ipfsData?.cid).toBe('cid2');
    process.chdir(originalCwd);
  });
});
