import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import flvjs from 'flv.js';

interface Props {
  streamKey: string;
  token?: string;
  // Toggle low-latency mode: use HTTP-FLV instead of HLS. FLV is ~2s lower
  // latency but doesn't play on iOS Safari.
  preferLowLatency?: boolean;
}

const MEDIA_BASE = import.meta.env.VITE_FLV_BASE || 'http://localhost:45000';

type Engine = 'hls-native' | 'hls-js' | 'flv' | 'unsupported';

function pickEngine(preferLowLatency: boolean, video: HTMLVideoElement): Engine {
  if (preferLowLatency && flvjs.isSupported()) return 'flv';

  // Safari and iOS play HLS natively — preferred path on those browsers.
  if (video.canPlayType('application/vnd.apple.mpegurl')) return 'hls-native';

  if (Hls.isSupported()) return 'hls-js';

  // Last-resort fallback if HLS isn't available (very old browsers).
  if (flvjs.isSupported()) return 'flv';

  return 'unsupported';
}

export function StreamPlayer({ streamKey, token, preferLowLatency = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const picked = pickEngine(preferLowLatency, video);
    setEngine(picked);
    setError(null);

    const hlsUrl = `${MEDIA_BASE}/live/${streamKey}/index.m3u8${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const flvUrl = `${MEDIA_BASE}/live/${streamKey}.flv${token ? `?token=${encodeURIComponent(token)}` : ''}`;

    let hls: Hls | null = null;
    let flv: ReturnType<typeof flvjs.createPlayer> | null = null;
    let cleanupExtra: (() => void) | null = null;

    if (picked === 'hls-native') {
      video.src = hlsUrl;
      const tryPlay = () => video.play().catch(() => {});
      video.addEventListener('loadedmetadata', tryPlay, { once: true });
      cleanupExtra = () => {
        video.removeEventListener('loadedmetadata', tryPlay);
        video.removeAttribute('src');
        video.load();
      };
    } else if (picked === 'hls-js') {
      hls = new Hls({
        lowLatencyMode: true,
        liveDurationInfinity: true,
        backBufferLength: 30,
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          // Soft error surface; live playlist may not exist yet if stream
          // just started — hls.js handles its own internal retries.
          setError(`HLS: ${data.details || data.type}`);
        }
      });
    } else if (picked === 'flv') {
      flv = flvjs.createPlayer({
        type: 'flv',
        url: flvUrl,
        isLive: true,
        cors: true,
      });
      flv.attachMediaElement(video);
      flv.load();
      const result = flv.play() as void | Promise<void>;
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => {});
      }
    } else {
      setError('No supported playback engine in this browser.');
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
      if (flv) {
        flv.pause();
        flv.unload();
        flv.detachMediaElement();
        flv.destroy();
      }
      if (cleanupExtra) cleanupExtra();
    };
  }, [streamKey, token, preferLowLatency]);

  return (
    <div className="player-wrap">
      <video ref={videoRef} controls autoPlay playsInline className="player-video" />
      {error && <div className="player-error">{error}</div>}
      {engine && <div className="player-engine" title={`Playback engine: ${engine}`}>{engine}</div>}
    </div>
  );
}
