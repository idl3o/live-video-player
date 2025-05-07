declare module 'node-media-server' {
  export default class NodeMediaServer {
    constructor(config: NodeMediaServerConfig);
    run(): void;
    stop(): void;
    getStreams(): Record<string, any>;
    
    // Event methods
    on(event: 'preConnect', listener: (id: string, args: any) => void): this;
    on(event: 'postConnect', listener: (id: string, args: any) => void): this;
    on(event: 'doneConnect', listener: (id: string, args: any) => void): this;
    on(event: 'prePublish', listener: (id: string, streamPath: string, args: any) => void): this;
    on(event: 'postPublish', listener: (id: string, streamPath: string, args: any) => void): this;
    on(event: 'donePublish', listener: (id: string, streamPath: string, args: any) => void): this;
  }

  export interface NodeMediaServerConfig {
    rtmp?: {
      port?: number;
      chunk_size?: number;
      gop_cache?: boolean;
      ping?: number;
      ping_timeout?: number;
    };
    http?: {
      port?: number;
      allow_origin?: string;
      mediaroot?: string;
    };
    https?: {
      port?: number;
      key?: string;
      cert?: string;
    };
    auth?: {
      play?: boolean;
      publish?: boolean;
      secret?: string;
    };
    trans?: {
      ffmpeg?: string;
      tasks?: Array<any>;
    };
  }
}