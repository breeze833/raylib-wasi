// audio-context.js - Web Audio API host bindings for raylib-wasi
// Supports direct in-thread Web Audio execution and proxying to createAudioReceiver

function createPanNode(ctx) {
  if (typeof ctx.createStereoPanner === 'function') {
    return ctx.createStereoPanner();
  }
  return null;
}

function setPanValue(panNode, pan) {
  if (!panNode) return;
  // Raylib pan: 0.0 (left) .. 0.5 (center) .. 1.0 (right)
  // Web Audio StereoPannerNode: -1.0 (left) .. 0.0 (center) .. 1.0 (right)
  const clampedPan = Math.max(0.0, Math.min(1.0, pan));
  const webPan = (clampedPan - 0.5) * 2.0;
  panNode.pan.setValueAtTime(webPan, panNode.context.currentTime);
}

function pcmToAudioBuffer(ctx, channels, sampleRate, sampleSize, frameCount, data) {
  const audioBuffer = ctx.createBuffer(channels, frameCount, sampleRate);
  const buf = (data && data.buffer) ? data.buffer : data;
  const offset = (data && typeof data.byteOffset === 'number') ? data.byteOffset : 0;

  if (sampleSize === 16) {
    const int16 = new Int16Array(buf, offset, frameCount * channels);
    for (let ch = 0; ch < channels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = int16[i * channels + ch] / 32768.0;
      }
    }
  } else if (sampleSize === 32) {
    const float32 = new Float32Array(buf, offset, frameCount * channels);
    for (let ch = 0; ch < channels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = float32[i * channels + ch];
      }
    }
  } else if (sampleSize === 8) {
    const uint8 = new Uint8Array(buf, offset, frameCount * channels);
    for (let ch = 0; ch < channels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = (uint8[i * channels + ch] - 128) / 128.0;
      }
    }
  }
  return audioBuffer;
}

class AudioStreamQueue {
  constructor(ctx, masterGain, channels, sampleRate, sampleSize) {
    this.ctx = ctx;
    this.masterGain = masterGain;
    this.channels = channels;
    this.sampleRate = sampleRate;
    this.sampleSize = sampleSize;
    this.volume = 1.0;
    this.pitch = 1.0;
    this.pan = 0.5;
    this.isPlaying = false;
    this.isPaused = false;

    this.gainNode = ctx.createGain();
    this.gainNode.gain.setValueAtTime(this.volume, ctx.currentTime);

    this.panNode = createPanNode(ctx);
    if (this.panNode) {
      setPanValue(this.panNode, this.pan);
      this.gainNode.connect(this.panNode);
      this.panNode.connect(masterGain || ctx.destination);
    } else {
      this.gainNode.connect(masterGain || ctx.destination);
    }

    this.nextPlayTime = 0;
    this.scheduledSources = [];
  }

  feedPcm(arrayBuffer, frameCount) {
    if (frameCount <= 0) return;
    const audioBuffer = pcmToAudioBuffer(
      this.ctx,
      this.channels,
      this.sampleRate,
      this.sampleSize,
      frameCount,
      arrayBuffer
    );
    this.feedAudioBuffer(audioBuffer);
  }

  feedAudioBuffer(audioBuffer) {
    if (!this.isPlaying || this.isPaused) return;

    const now = this.ctx.currentTime;
    if (this.nextPlayTime < now) {
      this.nextPlayTime = now + 0.02; // 20ms buffer ahead
    }

    const source = this.ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.setValueAtTime(this.pitch, this.ctx.currentTime);
    source.connect(this.gainNode);

    source.start(this.nextPlayTime);
    this.scheduledSources.push(source);

    const duration = audioBuffer.duration / Math.max(0.01, this.pitch);
    this.nextPlayTime += duration;

    source.onended = () => {
      const idx = this.scheduledSources.indexOf(source);
      if (idx !== -1) this.scheduledSources.splice(idx, 1);
    };
  }

  play() {
    this.isPlaying = true;
    this.isPaused = false;
    this.nextPlayTime = this.ctx.currentTime + 0.02;
  }

  pause() {
    this.isPaused = true;
    this.stopSources();
  }

  resume() {
    if (this.isPaused) {
      this.isPaused = false;
      this.isPlaying = true;
      this.nextPlayTime = this.ctx.currentTime + 0.02;
    }
  }

  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    this.stopSources();
    this.nextPlayTime = 0;
  }

  stopSources() {
    for (const src of this.scheduledSources) {
      try {
        src.stop();
        src.disconnect();
      } catch (_) {}
    }
    this.scheduledSources = [];
  }

  setVolume(vol) {
    this.volume = Math.max(0.0, vol);
    this.gainNode.gain.setValueAtTime(this.volume, this.ctx.currentTime);
  }

  setPitch(pitch) {
    this.pitch = Math.max(0.01, pitch);
    for (const src of this.scheduledSources) {
      src.playbackRate.setValueAtTime(this.pitch, this.ctx.currentTime);
    }
  }

  setPan(pan) {
    this.pan = pan;
    setPanValue(this.panNode, pan);
  }

  destroy() {
    this.stop();
    try {
      this.gainNode.disconnect();
      if (this.panNode) this.panNode.disconnect();
    } catch (_) {}
  }
}

export function createAudioImports(getMemory, options = {}) {
  let audioCtx = options.audioContext || null;
  let masterGain = null;
  let masterVolume = 1.0;
  let isReady = false;

  let nextBufferId = 1;
  const buffers = new Map(); // bufferId -> AudioBuffer (direct mode) or metadata (proxy mode)

  let nextVoiceId = 1;
  const voices = new Map(); // voiceId -> voice record

  let nextStreamId = 1;
  const streams = new Map(); // streamId -> AudioStreamQueue

  const useProxy = Boolean(options.onAudioMessage);

  function getAudioContext() {
    if (audioCtx) return audioCtx;
    const AudioContextClass = typeof AudioContext !== 'undefined'
      ? AudioContext
      : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);

    if (AudioContextClass) {
      try {
        audioCtx = new AudioContextClass();
      } catch (_) {}
    }
    return audioCtx;
  }

  function ensureMasterGain() {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (!masterGain) {
      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(masterVolume, ctx.currentTime);
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  function copyPcmFromWasm(channels, sampleSize, frameCount, dataPtr) {
    const mem = getMemory();
    const totalSamples = frameCount * channels;
    if (sampleSize === 16) {
      const src = new Int16Array(mem.buffer, dataPtr, totalSamples);
      const copy = new Int16Array(totalSamples);
      copy.set(src);
      return copy.buffer;
    } else if (sampleSize === 32) {
      const src = new Float32Array(mem.buffer, dataPtr, totalSamples);
      const copy = new Float32Array(totalSamples);
      copy.set(src);
      return copy.buffer;
    } else if (sampleSize === 8) {
      const src = new Uint8Array(mem.buffer, dataPtr, totalSamples);
      const copy = new Uint8Array(totalSamples);
      copy.set(src);
      return copy.buffer;
    }
    return null;
  }

  return {
    raylib_host_audio_init: () => {
      isReady = true;
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_init' });
        return 0;
      }
      const ctx = getAudioContext();
      if (ctx) {
        ensureMasterGain();
        if (options.onAudioInit) options.onAudioInit();
        return 0;
      }
      return 0; // Return success so C state initializes
    },

    raylib_host_audio_close: () => {
      for (const [id, voice] of voices.entries()) {
        if (voice.source) {
          try { voice.source.stop(); voice.source.disconnect(); } catch (_) {}
        }
      }
      voices.clear();
      buffers.clear();

      for (const [id, stream] of streams.entries()) {
        if (typeof stream.destroy === 'function') stream.destroy();
      }
      streams.clear();

      if (audioCtx) {
        try { audioCtx.close(); } catch (_) {}
        audioCtx = null;
      }
      masterGain = null;
      isReady = false;

      if (useProxy) {
        options.onAudioMessage({ type: 'audio_close' });
      }
    },

    raylib_host_audio_is_ready: () => {
      return isReady ? 1 : 0;
    },

    raylib_host_audio_set_master_volume: (volume) => {
      masterVolume = Math.max(0.0, volume);
      if (masterGain && audioCtx) {
        masterGain.gain.setValueAtTime(masterVolume, audioCtx.currentTime);
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_master_volume', volume: masterVolume });
      }
    },

    raylib_host_audio_get_master_volume: () => {
      return masterVolume;
    },

    // --- Sound Buffer Management ---
    raylib_host_audio_create_buffer: (channels, sampleRate, sampleSize, frameCount, dataPtr) => {
      if (frameCount <= 0 || channels <= 0) return 0;
      const id = nextBufferId++;

      if (useProxy) {
        const pcmBuf = copyPcmFromWasm(channels, sampleSize, frameCount, dataPtr);
        buffers.set(id, {
          channels,
          sampleRate,
          sampleSize,
          frameCount,
          duration: frameCount / sampleRate
        });
        if (pcmBuf) {
          options.onAudioMessage({
            type: 'audio_create_buffer',
            bufferId: id,
            channels,
            sampleRate,
            sampleSize,
            frameCount,
            data: pcmBuf
          }, [pcmBuf]);
        }
        return id;
      }

      const ctx = getAudioContext();
      if (!ctx) {
        // Fallback buffer metadata
        buffers.set(id, { duration: frameCount / sampleRate });
        return id;
      }
      ensureMasterGain();

      try {
        const mem = getMemory();
        const pcmSlice = copyPcmFromWasm(channels, sampleSize, frameCount, dataPtr);
        const audioBuf = pcmToAudioBuffer(ctx, channels, sampleRate, sampleSize, frameCount, pcmSlice);
        buffers.set(id, audioBuf);
        return id;
      } catch (err) {
        console.warn('raylib-wasi: Failed to create audio buffer:', err);
        return 0;
      }
    },

    raylib_host_audio_update_buffer: (bufferId, dataPtr, frameCount) => {
      if (useProxy) {
        const meta = buffers.get(bufferId);
        if (!meta) return;
        const pcmBuf = copyPcmFromWasm(meta.channels, meta.sampleSize, frameCount, dataPtr);
        if (pcmBuf) {
          options.onAudioMessage({
            type: 'audio_update_buffer',
            bufferId,
            frameCount,
            data: pcmBuf
          }, [pcmBuf]);
        }
        return;
      }

      const audioBuf = buffers.get(bufferId);
      const ctx = getAudioContext();
      if (!audioBuf || !ctx || frameCount <= 0 || typeof audioBuf.getChannelData !== 'function') return;

      const channels = audioBuf.numberOfChannels;
      const mem = getMemory();
      const float32 = new Float32Array(mem.buffer, dataPtr, frameCount * channels);
      for (let ch = 0; ch < channels; ch++) {
        const chData = audioBuf.getChannelData(ch);
        const count = Math.min(frameCount, chData.length);
        for (let i = 0; i < count; i++) {
          chData[i] = float32[i * channels + ch];
        }
      }
    },

    raylib_host_audio_destroy_buffer: (bufferId) => {
      buffers.delete(bufferId);
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_destroy_buffer', bufferId });
      }
    },

    // --- Sound Voice Playback Management ---
    raylib_host_audio_play: (bufferId, volume, pitch, pan, loop) => {
      const voiceId = nextVoiceId++;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());

      if (useProxy) {
        const meta = buffers.get(bufferId);
        const dur = meta ? (meta.duration / Math.max(0.01, pitch)) : 1.0;
        voices.set(voiceId, {
          bufferId,
          volume,
          pitch,
          pan,
          loop: Boolean(loop),
          isPlaying: true,
          isPaused: false,
          startTime: now,
          duration: dur
        });
        options.onAudioMessage({
          type: 'audio_play',
          voiceId,
          bufferId,
          volume,
          pitch,
          pan,
          loop: Boolean(loop)
        });
        return voiceId;
      }

      const audioBuf = buffers.get(bufferId);
      const ctx = getAudioContext();
      if (!audioBuf || !ctx || typeof ctx.createBufferSource !== 'function') {
        voices.set(voiceId, { isPlaying: true, isPaused: false, startTime: now, duration: 1.0 });
        return voiceId;
      }
      ensureMasterGain();

      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      source.loop = Boolean(loop);

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(Math.max(0.0, volume), ctx.currentTime);

      const panNode = createPanNode(ctx);
      if (panNode) {
        setPanValue(panNode, pan);
        source.connect(gainNode);
        gainNode.connect(panNode);
        panNode.connect(masterGain || ctx.destination);
      } else {
        source.connect(gainNode);
        gainNode.connect(masterGain || ctx.destination);
      }

      source.playbackRate.setValueAtTime(Math.max(0.01, pitch), ctx.currentTime);

      const voiceRecord = {
        source,
        gainNode,
        panNode,
        bufferId,
        volume,
        pitch,
        pan,
        loop: Boolean(loop),
        isPlaying: true,
        isPaused: false,
        startTime: ctx.currentTime,
        pausedAt: 0,
        duration: audioBuf.duration / Math.max(0.01, pitch)
      };

      source.onended = () => {
        voiceRecord.isPlaying = false;
        voiceRecord.isPaused = false;
        voices.delete(voiceId);
      };

      source.start(0);
      voices.set(voiceId, voiceRecord);
      return voiceId;
    },

    raylib_host_audio_stop: (voiceId) => {
      const voice = voices.get(voiceId);
      if (voice) {
        if (voice.source) {
          voice.source.onended = null;
          try { voice.source.stop(); voice.source.disconnect(); } catch (_) {}
        }
        voice.isPlaying = false;
        voice.isPaused = false;
        voices.delete(voiceId);
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stop', voiceId });
      }
    },

    raylib_host_audio_pause: (voiceId) => {
      const voice = voices.get(voiceId);
      if (!voice || !voice.isPlaying || voice.isPaused) return;

      if (useProxy) {
        voice.isPaused = true;
        options.onAudioMessage({ type: 'audio_pause', voiceId });
        return;
      }

      const ctx = getAudioContext();
      voice.pausedAt = (ctx.currentTime - voice.startTime) * voice.pitch;
      voice.isPaused = true;
      if (voice.source) {
        voice.source.onended = null;
        try { voice.source.stop(); } catch (_) {}
      }
    },

    raylib_host_audio_resume: (voiceId) => {
      const voice = voices.get(voiceId);
      if (!voice || !voice.isPaused) return;

      if (useProxy) {
        voice.isPaused = false;
        voice.startTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        options.onAudioMessage({ type: 'audio_resume', voiceId });
        return;
      }

      const ctx = getAudioContext();
      const audioBuf = buffers.get(voice.bufferId);
      if (!ctx || !audioBuf) return;

      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      source.loop = voice.loop;
      source.playbackRate.setValueAtTime(voice.pitch, ctx.currentTime);
      source.connect(voice.gainNode);

      source.onended = () => {
        voice.isPlaying = false;
        voice.isPaused = false;
        voices.delete(voiceId);
      };

      const offset = (voice.pausedAt || 0) % (audioBuf.duration || 1);
      source.start(0, offset);
      voice.source = source;
      voice.startTime = ctx.currentTime - (offset / Math.max(0.01, voice.pitch));
      voice.isPaused = false;
      voice.isPlaying = true;
    },

    raylib_host_audio_is_playing: (voiceId) => {
      const voice = voices.get(voiceId);
      if (!voice || !voice.isPlaying || voice.isPaused) return 0;
      if (useProxy) {
        if (!voice.loop) {
          const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          if (now - voice.startTime >= (voice.duration * 1000)) {
            voice.isPlaying = false;
            voices.delete(voiceId);
            return 0;
          }
        }
        return 1;
      }
      return (voice.isPlaying && !voice.isPaused) ? 1 : 0;
    },

    raylib_host_audio_set_volume: (voiceId, volume) => {
      const voice = voices.get(voiceId);
      if (voice) {
        voice.volume = Math.max(0.0, volume);
        if (voice.gainNode && audioCtx) {
          voice.gainNode.gain.setValueAtTime(voice.volume, audioCtx.currentTime);
        }
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_set_volume', voiceId, volume });
      }
    },

    raylib_host_audio_set_pitch: (voiceId, pitch) => {
      const voice = voices.get(voiceId);
      if (voice) {
        voice.pitch = Math.max(0.01, pitch);
        if (voice.source && audioCtx) {
          voice.source.playbackRate.setValueAtTime(voice.pitch, audioCtx.currentTime);
        }
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_set_pitch', voiceId, pitch });
      }
    },

    raylib_host_audio_set_pan: (voiceId, pan) => {
      const voice = voices.get(voiceId);
      if (voice) {
        voice.pan = pan;
        if (voice.panNode) setPanValue(voice.panNode, pan);
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_set_pan', voiceId, pan });
      }
    },

    // --- AudioStream Management ---
    raylib_host_audio_stream_init: (channels, sampleRate, sampleSize) => {
      const streamId = nextStreamId++;
      if (useProxy) {
        streams.set(streamId, { channels, sampleRate, sampleSize, isPlaying: false, isPaused: false });
        options.onAudioMessage({ type: 'audio_stream_init', streamId, channels, sampleRate, sampleSize });
        return streamId;
      }

      const ctx = getAudioContext();
      if (!ctx) return streamId;
      ensureMasterGain();

      const stream = new AudioStreamQueue(ctx, masterGain, channels, sampleRate, sampleSize);
      streams.set(streamId, stream);
      return streamId;
    },

    raylib_host_audio_stream_destroy: (streamId) => {
      const stream = streams.get(streamId);
      if (stream && typeof stream.destroy === 'function') stream.destroy();
      streams.delete(streamId);
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_destroy', streamId });
      }
    },

    raylib_host_audio_stream_feed: (streamId, dataPtr, frameCount) => {
      const stream = streams.get(streamId);
      if (!stream) return;

      if (useProxy) {
        const pcmBuf = copyPcmFromWasm(stream.channels, stream.sampleSize, frameCount, dataPtr);
        if (pcmBuf) {
          options.onAudioMessage({
            type: 'audio_stream_feed',
            streamId,
            frameCount,
            data: pcmBuf
          }, [pcmBuf]);
        }
        return;
      }

      const mem = getMemory();
      const pcmSlice = copyPcmFromWasm(stream.channels, stream.sampleSize, frameCount, dataPtr);
      stream.feedPcm(pcmSlice, frameCount);
    },

    raylib_host_audio_stream_play: (streamId) => {
      const stream = streams.get(streamId);
      if (stream) {
        stream.isPlaying = true;
        stream.isPaused = false;
        if (typeof stream.play === 'function') stream.play();
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_play', streamId });
      }
    },

    raylib_host_audio_stream_pause: (streamId) => {
      const stream = streams.get(streamId);
      if (stream) {
        stream.isPaused = true;
        if (typeof stream.pause === 'function') stream.pause();
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_pause', streamId });
      }
    },

    raylib_host_audio_stream_resume: (streamId) => {
      const stream = streams.get(streamId);
      if (stream) {
        stream.isPaused = false;
        stream.isPlaying = true;
        if (typeof stream.resume === 'function') stream.resume();
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_resume', streamId });
      }
    },

    raylib_host_audio_stream_stop: (streamId) => {
      const stream = streams.get(streamId);
      if (stream) {
        stream.isPlaying = false;
        stream.isPaused = false;
        if (typeof stream.stop === 'function') stream.stop();
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_stop', streamId });
      }
    },

    raylib_host_audio_stream_is_playing: (streamId) => {
      const stream = streams.get(streamId);
      return (stream && stream.isPlaying && !stream.isPaused) ? 1 : 0;
    },

    raylib_host_audio_stream_set_volume: (streamId, volume) => {
      const stream = streams.get(streamId);
      if (stream && typeof stream.setVolume === 'function') stream.setVolume(volume);
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_set_volume', streamId, volume });
      }
    },

    raylib_host_audio_stream_set_pitch: (streamId, pitch) => {
      const stream = streams.get(streamId);
      if (stream && typeof stream.setPitch === 'function') stream.setPitch(pitch);
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_set_pitch', streamId, pitch });
      }
    },

    raylib_host_audio_stream_set_pan: (streamId, pan) => {
      const stream = streams.get(streamId);
      if (stream && typeof stream.setPan === 'function') stream.setPan(pan);
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_set_pan', streamId, pan });
      }
    }
  };
}

// Standalone receiver for main threads receiving audio messages from workers
export function createAudioReceiver(options = {}) {
  const AudioContextClass = typeof AudioContext !== 'undefined'
    ? AudioContext
    : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);

  let ctx = options.audioContext || null;
  let masterGain = null;
  const buffers = new Map();
  const voices = new Map();
  const streams = new Map();

  function getContext() {
    if (!ctx && AudioContextClass) {
      try {
        ctx = new AudioContextClass();
        masterGain = ctx.createGain();
        masterGain.connect(ctx.destination);
      } catch (err) {
        console.warn('raylib-wasi createAudioReceiver: AudioContext creation failed:', err);
      }
    }
    if (ctx && !masterGain) {
      masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  return {
    handleMessage: (msg) => {
      if (!msg || !msg.type) return;
      const c = getContext();

      switch (msg.type) {
        case 'audio_init': {
          getContext();
          break;
        }

        case 'audio_close': {
          for (const [id, voice] of voices.entries()) {
            try { voice.source.stop(); voice.source.disconnect(); } catch (_) {}
          }
          voices.clear();
          buffers.clear();
          for (const [id, stream] of streams.entries()) {
            stream.destroy();
          }
          streams.clear();
          if (ctx) {
            try { ctx.close(); } catch (_) {}
            ctx = null;
            masterGain = null;
          }
          break;
        }

        case 'audio_master_volume': {
          if (masterGain && c) {
            masterGain.gain.setValueAtTime(Math.max(0.0, msg.volume), c.currentTime);
          }
          break;
        }

        case 'audio_create_buffer': {
          if (!c) return;
          try {
            const audioBuf = pcmToAudioBuffer(
              c,
              msg.channels,
              msg.sampleRate,
              msg.sampleSize,
              msg.frameCount,
              msg.data
            );
            buffers.set(msg.bufferId, audioBuf);
          } catch (err) {
            console.warn('createAudioReceiver: failed to create buffer:', err);
          }
          break;
        }

        case 'audio_update_buffer': {
          const audioBuf = buffers.get(msg.bufferId);
          if (!audioBuf) return;
          const float32 = new Float32Array(msg.data);
          const chCount = audioBuf.numberOfChannels;
          for (let ch = 0; ch < chCount; ch++) {
            const chData = audioBuf.getChannelData(ch);
            const count = Math.min(msg.frameCount, chData.length);
            for (let i = 0; i < count; i++) {
              chData[i] = float32[i * chCount + ch];
            }
          }
          break;
        }

        case 'audio_destroy_buffer': {
          buffers.delete(msg.bufferId);
          break;
        }

        case 'audio_play': {
          if (!c) return;
          const audioBuf = buffers.get(msg.bufferId);
          if (!audioBuf) {
            console.warn('createAudioReceiver: audio buffer not found:', msg.bufferId);
            return;
          }

          const source = c.createBufferSource();
          source.buffer = audioBuf;
          source.loop = Boolean(msg.loop);

          const gainNode = c.createGain();
          gainNode.gain.setValueAtTime(Math.max(0.0, msg.volume), c.currentTime);

          const panNode = createPanNode(c);
          if (panNode) {
            setPanValue(panNode, msg.pan);
            source.connect(gainNode);
            gainNode.connect(panNode);
            panNode.connect(masterGain || c.destination);
          } else {
            source.connect(gainNode);
            gainNode.connect(masterGain || c.destination);
          }

          source.playbackRate.setValueAtTime(Math.max(0.01, msg.pitch), c.currentTime);

          const voiceRecord = {
            source,
            gainNode,
            panNode,
            bufferId: msg.bufferId,
            volume: msg.volume,
            pitch: msg.pitch,
            pan: msg.pan,
            loop: Boolean(msg.loop),
            startTime: c.currentTime,
            pausedAt: 0
          };

          source.onended = () => {
            voices.delete(msg.voiceId);
          };

          source.start(0);
          voices.set(msg.voiceId, voiceRecord);
          break;
        }

        case 'audio_stop': {
          const voice = voices.get(msg.voiceId);
          if (voice) {
            voice.source.onended = null;
            try { voice.source.stop(); voice.source.disconnect(); } catch (_) {}
            voices.delete(msg.voiceId);
          }
          break;
        }

        case 'audio_pause': {
          const voice = voices.get(msg.voiceId);
          if (!voice || !c) return;
          voice.pausedAt = (c.currentTime - voice.startTime) * voice.pitch;
          voice.isPaused = true;
          voice.source.onended = null;
          try { voice.source.stop(); } catch (_) {}
          break;
        }

        case 'audio_resume': {
          const voice = voices.get(msg.voiceId);
          if (!voice || !c) return;
          const audioBuf = buffers.get(voice.bufferId);
          if (!audioBuf) return;

          const source = c.createBufferSource();
          source.buffer = audioBuf;
          source.loop = voice.loop;
          source.playbackRate.setValueAtTime(voice.pitch, c.currentTime);
          source.connect(voice.gainNode);

          source.onended = () => {
            voices.delete(msg.voiceId);
          };

          const offset = (voice.pausedAt || 0) % (audioBuf.duration || 1);
          source.start(0, offset);
          voice.source = source;
          voice.startTime = c.currentTime - (offset / Math.max(0.01, voice.pitch));
          voice.isPaused = false;
          break;
        }

        case 'audio_set_volume': {
          const voice = voices.get(msg.voiceId);
          if (voice && c) {
            voice.volume = Math.max(0.0, msg.volume);
            voice.gainNode.gain.setValueAtTime(voice.volume, c.currentTime);
          }
          break;
        }

        case 'audio_set_pitch': {
          const voice = voices.get(msg.voiceId);
          if (voice && c) {
            voice.pitch = Math.max(0.01, msg.pitch);
            voice.source.playbackRate.setValueAtTime(voice.pitch, c.currentTime);
          }
          break;
        }

        case 'audio_set_pan': {
          const voice = voices.get(msg.voiceId);
          if (voice) {
            voice.pan = msg.pan;
            if (voice.panNode) setPanValue(voice.panNode, msg.pan);
          }
          break;
        }

        case 'audio_stream_init': {
          if (!c) return;
          const stream = new AudioStreamQueue(c, masterGain, msg.channels, msg.sampleRate, msg.sampleSize);
          streams.set(msg.streamId, stream);
          break;
        }

        case 'audio_stream_feed': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.feedPcm(msg.data, msg.frameCount);
          break;
        }

        case 'audio_stream_play': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.play();
          break;
        }

        case 'audio_stream_pause': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.pause();
          break;
        }

        case 'audio_stream_resume': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.resume();
          break;
        }

        case 'audio_stream_stop': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.stop();
          break;
        }

        case 'audio_stream_destroy': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.destroy();
          streams.delete(msg.streamId);
          break;
        }

        case 'audio_stream_set_volume': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.setVolume(msg.volume);
          break;
        }

        case 'audio_stream_set_pitch': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.setPitch(msg.pitch);
          break;
        }

        case 'audio_stream_set_pan': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.setPan(msg.pan);
          break;
        }
      }
    },
    getContext: () => getContext(),
    resume: () => {
      const c = getContext();
      if (c && c.state === 'suspended') {
        return c.resume();
      }
      return Promise.resolve();
    },
    getState: () => {
      const c = getContext();
      return c ? c.state : 'uninitialized';
    }
  };
}
