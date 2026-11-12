// ============================================================================
// DiscordVoiceEngine & DiscordAudioFX
// Reconstruído a partir do contrato real de discord_voice-1/discord_voice/index.js
// extraído via morluto/rea (Evidence ID: ev_82a55f9acd4a51edc8bb7a4ddb33a1be16fee5152e948c6dac1928ff4b1eb949)
// ============================================================================

class DiscordAudioFX {
  constructor() {
    this.ctx = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playToneSequence(notes = [], volume = 0.14) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type || 'sine';
      osc.frequency.setValueAtTime(n.freq, now + (n.delay || 0));
      if (n.endFreq) {
        osc.frequency.exponentialRampToValueAtTime(n.endFreq, now + (n.delay || 0) + (n.duration || 0.12));
      }
      const peak = (n.gain ?? 1) * volume;
      gain.gain.setValueAtTime(0.0001, now + (n.delay || 0));
      gain.gain.linearRampToValueAtTime(peak, now + (n.delay || 0) + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (n.delay || 0) + (n.duration || 0.12));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + (n.delay || 0));
      osc.stop(now + (n.delay || 0) + (n.duration || 0.12) + 0.02);
    }
  }

  joinVoice() {
    this.playToneSequence([
      { freq: 440, duration: 0.09, delay: 0, type: 'triangle' },
      { freq: 587.33, duration: 0.14, delay: 0.08, type: 'triangle' }
    ]);
  }

  leaveVoice() {
    this.playToneSequence([
      { freq: 523.25, duration: 0.09, delay: 0, type: 'triangle' },
      { freq: 349.23, duration: 0.15, delay: 0.08, type: 'triangle' }
    ]);
  }

  mute(isMuted) {
    if (isMuted) {
      this.playToneSequence([
        { freq: 480, duration: 0.07, delay: 0 },
        { freq: 360, duration: 0.09, delay: 0.06 }
      ]);
    } else {
      this.playToneSequence([
        { freq: 380, duration: 0.07, delay: 0 },
        { freq: 520, duration: 0.09, delay: 0.06 }
      ]);
    }
  }

  deafen(isDeaf) {
    if (isDeaf) {
      this.playToneSequence([
        { freq: 420, duration: 0.07, delay: 0 },
        { freq: 310, duration: 0.07, delay: 0.06 },
        { freq: 240, duration: 0.11, delay: 0.12 }
      ]);
    } else {
      this.playToneSequence([
        { freq: 260, duration: 0.07, delay: 0 },
        { freq: 360, duration: 0.07, delay: 0.06 },
        { freq: 490, duration: 0.11, delay: 0.12 }
      ]);
    }
  }

  streamStart() {
    this.playToneSequence([
      { freq: 523.25, duration: 0.08, delay: 0, type: 'sine' },
      { freq: 659.25, duration: 0.08, delay: 0.07, type: 'sine' },
      { freq: 783.99, duration: 0.18, delay: 0.14, type: 'sine' }
    ]);
  }

  streamStop() {
    this.playToneSequence([
      { freq: 659.25, duration: 0.08, delay: 0, type: 'sine' },
      { freq: 440, duration: 0.15, delay: 0.07, type: 'sine' }
    ]);
  }

  messagePing() {
    this.playToneSequence([
      { freq: 740, duration: 0.06, delay: 0, type: 'sine' },
      { freq: 987.77, duration: 0.1, delay: 0.05, type: 'sine' }
    ], 0.09);
  }

  playSoundboardEffect(soundId) {
    switch (soundId) {
      case 'airhorn':
        this.playToneSequence([
          { freq: 466, endFreq: 485, duration: 0.45, delay: 0, type: 'sawtooth', gain: 0.9 },
          { freq: 698, endFreq: 720, duration: 0.45, delay: 0, type: 'sawtooth', gain: 0.6 }
        ], 0.16);
        break;
      case 'rimshot':
        this.playToneSequence([
          { freq: 140, endFreq: 80, duration: 0.11, delay: 0, type: 'triangle' },
          { freq: 220, endFreq: 130, duration: 0.11, delay: 0.14, type: 'triangle' },
          { freq: 820, endFreq: 540, duration: 0.32, delay: 0.28, type: 'sawtooth', gain: 0.6 }
        ], 0.18);
        break;
      case 'victory':
        this.playToneSequence([
          { freq: 523.25, duration: 0.1, delay: 0, type: 'triangle' },
          { freq: 659.25, duration: 0.1, delay: 0.1, type: 'triangle' },
          { freq: 783.99, duration: 0.1, delay: 0.2, type: 'triangle' },
          { freq: 1046.5, duration: 0.3, delay: 0.3, type: 'triangle' }
        ], 0.18);
        break;
      case 'quack':
        this.playToneSequence([
          { freq: 620, endFreq: 310, duration: 0.18, delay: 0, type: 'sawtooth' },
          { freq: 640, endFreq: 320, duration: 0.2, delay: 0.22, type: 'sawtooth' }
        ], 0.16);
        break;
      case 'bell':
        this.playToneSequence([
          { freq: 1174.66, duration: 0.45, delay: 0, type: 'sine' },
          { freq: 2349.32, duration: 0.25, delay: 0, type: 'sine', gain: 0.5 }
        ], 0.18);
        break;
      case 'alert':
        this.playToneSequence([
          { freq: 880, endFreq: 440, duration: 0.18, delay: 0, type: 'square' },
          { freq: 880, endFreq: 440, duration: 0.18, delay: 0.2, type: 'square' }
        ], 0.14);
        break;
      default:
        this.playToneSequence([
          { freq: 440, duration: 0.12, delay: 0, type: 'sine' },
          { freq: 880, duration: 0.2, delay: 0.12, type: 'sine' }
        ], 0.15);
    }
  }
}

class DiscordVoiceEngine {
  constructor({ socket, audioFX, getIceServers, onStreamsChanged, onSpeakingChanged, onRelayFrame, onStatsUpdated, onToast }) {
    this.socket = socket;
    this.audioFX = audioFX;
    this.getIceServers = getIceServers;
    this.onStreamsChanged = onStreamsChanged || (() => {});
    this.onSpeakingChanged = onSpeakingChanged || (() => {});
    this.onRelayFrame = onRelayFrame || (() => {});
    this.onStatsUpdated = onStatsUpdated || (() => {});
    this.onToast = onToast || (() => {});

    this.channelId = null;
    this.serverId = null;
    this.selfMute = false;
    this.selfDeaf = false;
    this.videoEnabled = false;
    this.screenShareEnabled = false;
    this.streamOptions = {
      resolution: 1080,
      fps: 60,
      contentHint: 'motion',
      includeAudio: true
    };

    // Local MediaStreams
    this.micStream = null;
    this.camStream = null;
    this.screenStream = null;

    // Peer Connections & Remote Streams
    // peers: Map<userId, { pc, socketId, mediaMeta, camStream, screenStream, audioStream, audioEl, gainNode }>
    this.peers = new Map();

    // Local per-user volume settings (0 to 200, default 100)
    this.userVolumes = new Map();
    this.userLocalMuted = new Map();

    // Speaking detector (VAD)
    this.vadInterval = null;
    this.isSpeaking = false;

    // Fallback screen frame relay timer
    this.relayInterval = null;
    this.relayVideoEl = null;
    this.relayCanvas = null;

    // Stats interval
    this.statsInterval = null;
    this.lastRtt = 18;

    this.bindSocketEvents();
  }

  bindSocketEvents() {
    this.socket.on('voice:peers-in-channel', async ({ channelId, peers }) => {
      if (channelId !== this.channelId) return;
      for (const p of peers || []) {
        await this.createOfferToPeer(p.userId, p.socketId);
      }
    });

    this.socket.on('voice:peer-left', ({ userId }) => {
      this.cleanupPeer(userId);
      this.onStreamsChanged();
    });

    this.socket.on('webrtc:offer', async ({ fromSocketId, fromUserId, sdp, channelId, mediaMeta }) => {
      if (channelId !== this.channelId) return;
      try {
        const peer = await this.ensurePeer(fromUserId, fromSocketId);
        if (mediaMeta) peer.mediaMeta = mediaMeta;
        await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.socket.emit('webrtc:answer', {
          targetSocketId: fromSocketId,
          targetUserId: fromUserId,
          sdp: peer.pc.localDescription,
          channelId: this.channelId
        });
      } catch (err) {
        console.warn('Erro ao processar webrtc:offer:', err);
      }
    });

    this.socket.on('webrtc:answer', async ({ fromUserId, sdp, channelId }) => {
      if (channelId !== this.channelId) return;
      const peer = this.peers.get(fromUserId);
      if (!peer) return;
      try {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (err) {
        console.warn('Erro ao processar webrtc:answer:', err);
      }
    });

    this.socket.on('webrtc:ice-candidate', async ({ fromUserId, candidate, channelId }) => {
      if (channelId !== this.channelId) return;
      const peer = this.peers.get(fromUserId);
      if (!peer || !candidate) return;
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('Erro ao adicionar ICE candidate:', err);
      }
    });

    this.socket.on('voice:relay-frame', (payload) => {
      if (payload.channelId !== this.channelId) return;
      this.onRelayFrame(payload);
    });
  }

  getLocalMediaMeta() {
    return {
      micStreamId: this.micStream?.id || null,
      camStreamId: this.camStream?.id || null,
      screenStreamId: this.screenStream?.id || null
    };
  }

  async joinChannel(channelId, serverId = null) {
    if (this.channelId === channelId) return;
    if (this.channelId) {
      await this.leaveChannel(true);
    }

    this.channelId = channelId;
    this.serverId = serverId;

    // Acquire microphone stream (graceful fallback if user has no mic or denies permission)
    await this.acquireMicrophone();

    this.audioFX.joinVoice();
    this.socket.emit('voice:join', {
      channelId: this.channelId,
      serverId: this.serverId,
      selfMute: this.selfMute,
      selfDeaf: this.selfDeaf,
      video: this.videoEnabled,
      screenShare: this.screenShareEnabled,
      streamOptions: this.screenShareEnabled ? this.streamOptions : null
    });

    this.startStatsLoop();
    this.onStreamsChanged();
  }

  async acquireMicrophone(deviceId) {
    try {
      if (this.micStream) {
        this.micStream.getTracks().forEach(t => t.stop());
      }
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {})
        },
        video: false
      };
      this.micStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.micStream.getAudioTracks().forEach(t => {
        t.enabled = !this.selfMute && !this.selfDeaf;
      });
      this.startVoiceActivityDetection(this.micStream);
    } catch (err) {
      console.warn('Microfone indisponível ou permissão negada (entrando em modo ouvinte):', err.message);
      this.micStream = null;
    }
  }

  startVoiceActivityDetection(stream) {
    if (this.vadInterval) clearInterval(this.vadInterval);
    if (!stream || stream.getAudioTracks().length === 0) return;

    try {
      const ctx = this.audioFX.ensureContext();
      if (!ctx) return;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      this.vadInterval = setInterval(() => {
        if (this.selfMute || this.selfDeaf || !this.channelId) {
          if (this.isSpeaking) {
            this.isSpeaking = false;
            this.socket.emit('voice:speaking', { speaking: false });
            this.onSpeakingChanged(false);
          }
          return;
        }
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        const speakingNow = avg > 14;
        if (speakingNow !== this.isSpeaking) {
          this.isSpeaking = speakingNow;
          this.socket.emit('voice:speaking', { speaking: speakingNow });
          this.onSpeakingChanged(speakingNow);
        }
      }, 130);
    } catch (_e) {}
  }

  async leaveChannel(silent = false) {
    if (!this.channelId) return;
    if (!silent) this.audioFX.leaveVoice();

    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    this.stopFallbackRelay();

    for (const userId of Array.from(this.peers.keys())) {
      this.cleanupPeer(userId);
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    if (this.camStream) {
      this.camStream.getTracks().forEach(t => t.stop());
      this.camStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }

    this.videoEnabled = false;
    this.screenShareEnabled = false;
    this.channelId = null;
    this.serverId = null;

    this.socket.emit('voice:leave');
    this.onStreamsChanged();
  }

  setSelfMute(mute) {
    this.selfMute = !!mute;
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach(t => {
        t.enabled = !this.selfMute && !this.selfDeaf;
      });
    }
    this.audioFX.mute(this.selfMute);
    if (this.channelId) {
      this.socket.emit('voice:state', { selfMute: this.selfMute });
    }
    this.onStreamsChanged();
  }

  setSelfDeafen(deaf) {
    this.selfDeaf = !!deaf;
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach(t => {
        t.enabled = !this.selfMute && !this.selfDeaf;
      });
    }
    // Mute/unmute all remote audio elements
    for (const [userId, peer] of this.peers.entries()) {
      this.applyPeerVolume(userId, peer);
    }
    this.audioFX.deafen(this.selfDeaf);
    if (this.channelId) {
      this.socket.emit('voice:state', { selfDeaf: this.selfDeaf, selfMute: this.selfMute || this.selfDeaf });
    }
    this.onStreamsChanged();
  }

  async setVideoBroadcast(enable, deviceId) {
    if (!this.channelId) {
      this.onToast('Entre em um canal de voz primeiro para ligar a câmera.');
      return false;
    }

    if (!enable) {
      if (this.camStream) {
        this.camStream.getTracks().forEach(t => {
          this.removeTrackFromPeers(t);
          t.stop();
        });
        this.camStream = null;
      }
      this.videoEnabled = false;
      this.socket.emit('voice:state', { video: false });
      await this.renegotiateAllPeers();
      this.onStreamsChanged();
      return false;
    }

    try {
      this.camStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          ...(deviceId ? { deviceId: { exact: deviceId } } : {})
        },
        audio: false
      });

      this.videoEnabled = true;
      for (const track of this.camStream.getTracks()) {
        this.addTrackToPeers(track, this.camStream);
        track.onended = () => {
          this.setVideoBroadcast(false);
        };
      }

      this.socket.emit('voice:state', { video: true });
      await this.renegotiateAllPeers();
      this.onStreamsChanged();
      return true;
    } catch (err) {
      this.onToast(`Não foi possível acessar a câmera: ${err.message}`);
      return false;
    }
  }

  // Go Live / Screen Share (setDesktopSourceWithOptions from discord_voice)
  async setDesktopSourceWithOptions(options = {}) {
    if (!this.channelId) {
      this.onToast('Entre em um canal de voz ou chamada DM primeiro para compartilhar a tela!');
      return false;
    }

    const resHeight = Number(options.resolution) || 1080;
    const resWidth = resHeight === 1440 ? 2560 : resHeight === 1080 ? 1920 : 1280;
    const fps = Number(options.fps) || 60;
    const includeAudio = options.includeAudio !== false;
    const contentHint = options.contentHint || 'motion';

    try {
      if (this.screenStream) {
        await this.clearDesktopSource(true);
      }

      const displayConstraints = {
        video: {
          width: { ideal: resWidth, max: 3840 },
          height: { ideal: resHeight, max: 2160 },
          frameRate: { ideal: fps, max: 60 },
          cursor: 'always'
        },
        audio: includeAudio
          ? {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false
            }
          : false
      };

      const stream = await navigator.mediaDevices.getDisplayMedia(displayConstraints);
      this.screenStream = stream;
      this.screenShareEnabled = true;
      this.streamOptions = {
        resolution: resHeight,
        fps,
        contentHint,
        includeAudio,
        hasSystemAudio: stream.getAudioTracks().length > 0,
        label: stream.getVideoTracks()[0]?.label || 'Tela Compartilhada'
      };

      const vTrack = stream.getVideoTracks()[0];
      if (vTrack && 'contentHint' in vTrack) {
        try { vTrack.contentHint = contentHint; } catch (_e) {}
      }

      for (const track of stream.getTracks()) {
        this.addTrackToPeers(track, stream);
      }

      if (vTrack) {
        vTrack.onended = () => {
          this.clearDesktopSource();
        };
      }

      this.audioFX.streamStart();
      this.socket.emit('voice:state', {
        screenShare: true,
        streamOptions: this.streamOptions
      });

      await this.renegotiateAllPeers();
      this.startFallbackRelay(stream);
      this.onStreamsChanged();
      return true;
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        this.onToast(`Erro ao compartilhar tela: ${err.message}`);
      }
      return false;
    }
  }

  async clearDesktopSource(silent = false) {
    this.stopFallbackRelay();
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => {
        this.removeTrackFromPeers(t);
        t.stop();
      });
      this.screenStream = null;
    }
    this.screenShareEnabled = false;
    if (!silent) this.audioFX.streamStop();
    if (this.channelId) {
      this.socket.emit('voice:state', {
        screenShare: false,
        streamOptions: null
      });
      await this.renegotiateAllPeers();
    }
    this.onStreamsChanged();
  }

  // Fallback WebSocket frame relay so friends behind strict UDP-blocking firewalls still see the screen share
  startFallbackRelay(stream) {
    this.stopFallbackRelay();
    try {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      video.play().catch(() => {});
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      this.relayVideoEl = video;
      this.relayCanvas = canvas;

      this.relayInterval = setInterval(() => {
        if (!this.screenShareEnabled || !this.channelId || !video.videoWidth) return;
        // Send relay frame if there are peers in the channel
        if (this.peers.size === 0) return;
        const targetW = Math.min(960, video.videoWidth);
        const targetH = Math.round((video.videoHeight / video.videoWidth) * targetW);
        canvas.width = targetW;
        canvas.height = targetH;
        ctx.drawImage(video, 0, 0, targetW, targetH);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.58);
        this.socket.emit('voice:relay-frame', {
          channelId: this.channelId,
          kind: 'screen',
          dataUrl,
          width: targetW,
          height: targetH
        });
      }, 450);
    } catch (_e) {}
  }

  stopFallbackRelay() {
    if (this.relayInterval) {
      clearInterval(this.relayInterval);
      this.relayInterval = null;
    }
    if (this.relayVideoEl) {
      this.relayVideoEl.srcObject = null;
      this.relayVideoEl = null;
    }
  }

  addTrackToPeers(track, stream) {
    for (const peer of this.peers.values()) {
      const senders = peer.pc.getSenders();
      if (!senders.some(s => s.track === track)) {
        try {
          peer.pc.addTrack(track, stream);
        } catch (_e) {}
      }
    }
  }

  removeTrackFromPeers(track) {
    for (const peer of this.peers.values()) {
      const sender = peer.pc.getSenders().find(s => s.track === track);
      if (sender) {
        try {
          peer.pc.removeTrack(sender);
        } catch (_e) {}
      }
    }
  }

  async ensurePeer(remoteUserId, remoteSocketId) {
    let peer = this.peers.get(remoteUserId);
    if (peer) {
      if (remoteSocketId) peer.socketId = remoteSocketId;
      return peer;
    }

    const pc = new RTCPeerConnection({
      iceServers: this.getIceServers()
    });

    peer = {
      userId: remoteUserId,
      socketId: remoteSocketId,
      pc,
      mediaMeta: {},
      camStream: null,
      screenStream: null,
      audioStreams: new Set(),
      audioEls: new Map()
    };
    this.peers.set(remoteUserId, peer);

    // Attach all currently active local tracks
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => pc.addTrack(t, this.micStream));
    }
    if (this.camStream) {
      this.camStream.getTracks().forEach(t => pc.addTrack(t, this.camStream));
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => pc.addTrack(t, this.screenStream));
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate && this.channelId) {
        this.socket.emit('webrtc:ice-candidate', {
          targetSocketId: peer.socketId,
          targetUserId: remoteUserId,
          candidate: ev.candidate,
          channelId: this.channelId
        });
      }
    };

    pc.ontrack = (ev) => {
      const stream = ev.streams[0] || new MediaStream([ev.track]);
      if (ev.track.kind === 'audio') {
        peer.audioStreams.add(stream);
        this.attachRemoteAudio(remoteUserId, peer, stream);
      } else if (ev.track.kind === 'video') {
        const isScreen =
          (peer.mediaMeta?.screenStreamId && stream.id === peer.mediaMeta.screenStreamId) ||
          (!peer.mediaMeta?.camStreamId && peer.camStream && peer.camStream.id !== stream.id);

        if (isScreen) {
          peer.screenStream = stream;
        } else if (peer.mediaMeta?.camStreamId && stream.id === peer.mediaMeta.camStreamId) {
          peer.camStream = stream;
        } else {
          // Fallback: if peer is marked as screenShare in voiceStates and not camera, assign to screenStream
          peer.screenStream = peer.screenStream || stream;
          if (peer.screenStream !== stream) peer.camStream = stream;
        }

        ev.track.onended = () => {
          if (peer.screenStream === stream) peer.screenStream = null;
          if (peer.camStream === stream) peer.camStream = null;
          this.onStreamsChanged();
        };
      }
      this.onStreamsChanged();
    };

    pc.onconnectionstatechange = () => {
      this.onStreamsChanged();
    };

    return peer;
  }

  attachRemoteAudio(userId, peer, stream) {
    if (peer.audioEls.has(stream.id)) return;
    const audio = new Audio();
    audio.autoplay = true;
    audio.playsInline = true;
    audio.srcObject = stream;

    // Web Audio API GainNode for 0% - 200% per-user volume boost
    let gainNode = null;
    try {
      const ctx = this.audioFX.ensureContext();
      if (ctx) {
        const src = ctx.createMediaStreamSource(stream);
        gainNode = ctx.createGain();
        src.connect(gainNode);
        gainNode.connect(ctx.destination);
        audio.muted = true; // Output comes through GainNode so >100% boost works!
      }
    } catch (_e) {}

    peer.audioEls.set(stream.id, { audio, gainNode });
    this.applyPeerVolume(userId, peer);
    audio.play().catch(() => {});
  }

  applyPeerVolume(userId, peer) {
    const volPercent = this.userVolumes.get(userId) ?? 100;
    const localMuted = this.userLocalMuted.get(userId) || false;
    const effectiveGain = (this.selfDeaf || localMuted) ? 0 : (volPercent / 100);

    for (const item of peer.audioEls.values()) {
      if (item.gainNode) {
        item.gainNode.gain.value = effectiveGain;
      } else if (item.audio) {
        item.audio.muted = this.selfDeaf || localMuted;
        item.audio.volume = Math.min(1, effectiveGain);
      }
    }
  }

  setLocalVolume(userId, volumePercent) {
    const clamped = Math.max(0, Math.min(200, Number(volumePercent) || 100));
    this.userVolumes.set(userId, clamped);
    const peer = this.peers.get(userId);
    if (peer) this.applyPeerVolume(userId, peer);
  }

  getLocalVolume(userId) {
    return this.userVolumes.get(userId) ?? 100;
  }

  setLocalMute(userId, muted) {
    this.userLocalMuted.set(userId, !!muted);
    const peer = this.peers.get(userId);
    if (peer) this.applyPeerVolume(userId, peer);
  }

  async createOfferToPeer(remoteUserId, remoteSocketId) {
    try {
      const peer = await this.ensurePeer(remoteUserId, remoteSocketId);
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.socket.emit('webrtc:offer', {
        targetSocketId: peer.socketId,
        targetUserId: remoteUserId,
        sdp: peer.pc.localDescription,
        channelId: this.channelId,
        mediaMeta: this.getLocalMediaMeta()
      });
    } catch (err) {
      console.warn('Erro ao criar oferta WebRTC:', err);
    }
  }

  async renegotiateAllPeers() {
    for (const [userId, peer] of this.peers.entries()) {
      await this.createOfferToPeer(userId, peer.socketId);
    }
  }

  cleanupPeer(userId) {
    const peer = this.peers.get(userId);
    if (!peer) return;
    try {
      peer.pc.close();
    } catch (_e) {}
    for (const item of peer.audioEls.values()) {
      try {
        item.audio.pause();
        item.audio.srcObject = null;
      } catch (_e) {}
    }
    this.peers.delete(userId);
  }

  startStatsLoop() {
    if (this.statsInterval) clearInterval(this.statsInterval);
    this.statsInterval = setInterval(async () => {
      if (!this.channelId) return;
      let rttMs = 16;
      for (const peer of this.peers.values()) {
        try {
          const stats = await peer.pc.getStats();
          stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.currentRoundTripTime) {
              rttMs = Math.round(report.currentRoundTripTime * 1000);
            }
          });
        } catch (_e) {}
      }
      this.lastRtt = rttMs;
      this.onStatsUpdated({ rtt: rttMs, peersCount: this.peers.size });
    }, 3000);
  }

  getMLSPairwiseFingerprint(peerUserId) {
    return new Promise((resolve) => {
      this.socket.emit(
        'voice:mls-fingerprint',
        { peerUserId, channelId: this.channelId },
        (res) => resolve(res)
      );
    });
  }
}

window.DiscordAudioFX = DiscordAudioFX;
window.DiscordVoiceEngine = DiscordVoiceEngine;

