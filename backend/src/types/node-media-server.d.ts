declare module 'node-media-server' {
  export default class NodeMediaServer {
    constructor(config: NodeMediaServerConfig);
    run(): void;
    stop(): void;
    getStreams(): Record<string, any>;
    getSession(id: string): Session;
    
    // Event methods
    on(event: 'preConnect', listener: (id: string, args: any) => void): this;
    on(event: 'postConnect', listener: (id: string, args: any) => void): this;
    on(event: 'doneConnect', listener: (id: string, args: any) => void): this;
    on(event: 'prePublish', listener: (id: string, streamPath: string, args: any) => void): this;
    on(event: 'postPublish', listener: (id: string, streamPath: string, args: any) => void): this;
    on(event: 'donePublish', listener: (id: string, streamPath: string, args: any) => void): this;
    on(event: 'prePlay', listener: (id: string, streamPath: string, args: any) => void): this;
    on(event: 'postPlay', listener: (id: string, streamPath: string, args: any) => void): this;
    on(event: 'donePlay', listener: (id: string, streamPath: string, args: any) => void): this;
  }

  export interface Session {
    reject(): void;
    accept(): void;
  }

  export interface NodeMediaServerConfig {
    rtmp?: {
      port?: number;
      chunk_size?: number;
      gop_cache?: boolean;
      ping?: number;
      ping_timeout?: number;
      host?: string;
      allow_origin?: string;
    };
    http?: {
      port?: number;
      allow_origin?: string;
      mediaroot?: string;
      host?: string;
      cors?: {
        enabled?: boolean;
        origin?: string;
        methods?: string;
        credentials?: boolean;
        maxAge?: number;
      };
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
    logType?: number;
  }
}