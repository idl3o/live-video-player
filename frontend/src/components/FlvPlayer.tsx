import { useEffect, useRef } from 'react';
import flvjs from 'flv.js';

interface Props {
  streamKey: string;
  token?: string;
}

const HTTP_FLV_BASE = (import.meta as any).env?.VITE_FLV_BASE || 'http://localhost:45000';

export function FlvPlayer({ streamKey, token }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !flvjs.isSupported()) return;

    const url = new URL(`${HTTP_FLV_BASE}/live/${streamKey}.flv`);
    if (token) url.searchParams.set('token', token);

    const player = flvjs.createPlayer({
      type: 'flv',
      url: url.toString(),
      isLive: true,
      cors: true,
    });
    player.attachMediaElement(video);
    player.load();
    const playResult = player.play() as void | Promise<void>;
    if (playResult && typeof (playResult as Promise<void>).catch === 'function') {
      (playResult as Promise<void>).catch(() => {
        // Autoplay can be blocked; let user gesture handle it.
      });
    }

    return () => {
      player.pause();
      player.unload();
      player.detachMediaElement();
      player.destroy();
    };
  }, [streamKey, token]);

  if (!flvjs.isSupported()) {
    return <div className="player-unsupported">flv.js is not supported in this browser.</div>;
  }

  return <video ref={videoRef} controls autoPlay className="player-video" />;
}
