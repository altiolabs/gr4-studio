import { useEffect, useMemo, useRef, useState } from 'react';
import { StudioAudioPlaybackController, type AudioPlaybackStats } from '../../application/audio/audio-playback-controller';
import {
  createAudioWebSocketSubscription,
  normalizeAudioWebSocketEndpoint,
  type AudioConnectionState,
} from '../../application/audio/runtime/audio-websocket-runtime';
import type { AudioFrame } from '../../application/audio/runtime/audio-frame';
import type { WorkspaceLiveRendererContext } from './live-renderer-contract';

type AudioLiveRendererProps = {
  liveContext: WorkspaceLiveRendererContext;
};

type AudioDeviceInfo = {
  deviceId: string;
  label: string;
};

async function listAudioOutputDevices(): Promise<AudioDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return [{ deviceId: 'default', label: 'Default output' }];
  }

  let devices = await navigator.mediaDevices.enumerateDevices();
  if (devices.every((device) => !device.label) && navigator.mediaDevices.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch {
      // Permission is optional. Playback can continue with the default device.
    }
  }

  const outputs = devices
    .filter((device) => device.kind === 'audiooutput')
    .map((device, index) => ({
      deviceId: device.deviceId || 'default',
      label: device.label || (index === 0 ? 'Default output' : `Output ${index + 1}`),
    }));

  return outputs.length > 0 ? outputs : [{ deviceId: 'default', label: 'Default output' }];
}

export function AudioLiveRenderer({ liveContext }: AudioLiveRendererProps) {
  const endpoint = liveContext.binding.endpoint?.trim() ?? '';
  const runtimeActive = liveContext.executionState === 'running';
  const supportsLivePath =
    runtimeActive &&
    liveContext.binding.status === 'configured' &&
    liveContext.binding.transport === 'websocket' &&
    endpoint.length > 0;
  const channels = liveContext.binding.channels ?? 1;
  const sampleRate = liveContext.binding.sampleRate ?? 48000;
  const normalizedEndpoint = useMemo(() => normalizeAudioWebSocketEndpoint(endpoint), [endpoint]);

  const controllerRef = useRef<StudioAudioPlaybackController | null>(null);
  const expectedSequenceRef = useRef<bigint | null>(null);
  const [playing, setPlaying] = useState(false);
  const [connectionState, setConnectionState] = useState<AudioConnectionState>('closed');
  const [message, setMessage] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.8);
  const [stats, setStats] = useState<AudioPlaybackStats | null>(null);
  const [devices, setDevices] = useState<AudioDeviceInfo[]>([{ deviceId: 'default', label: 'Default output' }]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('default');
  const [deviceSelectionSupported, setDeviceSelectionSupported] = useState(true);
  const [lastFrame, setLastFrame] = useState<AudioFrame | null>(null);

  useEffect(() => {
    void listAudioOutputDevices().then(setDevices);
  }, []);

  useEffect(() => {
    controllerRef.current = new StudioAudioPlaybackController(setStats);
    return () => {
      controllerRef.current?.close();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    if (!supportsLivePath || !playing) {
      return undefined;
    }

    setConnectionState('connecting');
    setMessage(null);
    expectedSequenceRef.current = null;
    return createAudioWebSocketSubscription({
      endpoint: normalizedEndpoint,
      onFrame: (frame) => {
        setLastFrame(frame);
        if (expectedSequenceRef.current !== null && frame.sequence !== expectedSequenceRef.current) {
          setMessage(`Audio sequence gap: expected ${expectedSequenceRef.current}, got ${frame.sequence}.`);
        }
        expectedSequenceRef.current = frame.sequence + 1n;
        controllerRef.current?.pushFrame(frame);
      },
      onConnectionState: (state, stateMessage) => {
        setConnectionState(state);
        if (stateMessage) {
          setMessage(stateMessage);
        }
      },
    });
  }, [normalizedEndpoint, playing, supportsLivePath]);

  useEffect(() => {
    if (!runtimeActive) {
      setPlaying(false);
      controllerRef.current?.clear();
    }
  }, [runtimeActive]);

  const togglePlayback = async () => {
    if (!playing) {
      await controllerRef.current?.start({ channels, sampleRate });
      setPlaying(true);
      return;
    }

    controllerRef.current?.pause();
    setPlaying(false);
  };

  const handleDeviceChange = async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    const ok = await controllerRef.current?.setOutputDevice(deviceId);
    setDeviceSelectionSupported(ok !== false);
  };

  return (
    <div className="h-full rounded border border-slate-700 bg-slate-950/70 p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-100">{liveContext.panel.title ?? 'Audio'}</p>
        <span className="text-[10px] text-slate-400">{connectionState}</span>
      </div>

      {!supportsLivePath && (
        <p className="text-[11px] text-slate-400">
          {liveContext.binding.status === 'configured'
            ? 'Audio playback waits for a running websocket stream.'
            : 'Configure a StudioAudioSink websocket binding to enable playback.'}
        </p>
      )}

      <div className="grid grid-cols-[auto_1fr] items-center gap-3">
        <button
          type="button"
          onClick={() => {
            void togglePlayback();
          }}
          disabled={!supportsLivePath}
          className="h-9 rounded border border-slate-600 bg-slate-900 px-3 text-xs font-medium text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {playing ? 'Pause' : 'Play'}
        </button>

        <label className="grid grid-cols-[64px_1fr] items-center gap-2 text-[11px] text-slate-300">
          <span>Volume</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(event) => setVolume(Number(event.currentTarget.value))}
            className="w-full"
          />
        </label>
      </div>

      <label className="grid gap-1 text-[11px] text-slate-300">
        <span>Output Device</span>
        <select
          value={selectedDeviceId}
          onChange={(event) => {
            void handleDeviceChange(event.currentTarget.value);
          }}
          disabled={!deviceSelectionSupported}
          className="h-8 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 disabled:opacity-60"
        >
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
        <span>Rate {lastFrame?.sampleRate ?? sampleRate} Hz</span>
        <span>Channels {lastFrame?.channels ?? channels}</span>
        <span>
          Buffer {stats ? `${stats.availableFrames}/${stats.capacityFrames}` : 'n/a'}
        </span>
        <span>Underruns {stats?.underruns ?? 0}</span>
      </div>

      {message && <p className="text-[11px] text-amber-200 break-words">{message}</p>}
    </div>
  );
}
