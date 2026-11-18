import { ICE_SERVERS } from './constants';

const STATS_INTERVAL_MS = 2000;
const DISCONNECT_GRACE_MS = 8000;

function safeJson(description) {
  if (!description) return null;
  return { type: description.type, sdp: description.sdp };
}

function qualityLabel({ rttMs, packetLossPct }) {
  if (rttMs === null && packetLossPct === null) return 'connecting';
  if ((rttMs ?? 0) < 140 && (packetLossPct ?? 0) < 2) return 'excellent';
  if ((rttMs ?? 0) < 280 && (packetLossPct ?? 0) < 6) return 'good';
  return 'poor';
}

/**
 * A single peer connection for a 1:1 call.
 *
 * Negotiation follows the "perfect negotiation" pattern: the caller is
 * impolite and wins offer collisions, the callee is polite and rolls back.
 * That keeps renegotiation (screen share, camera switch) deterministic without
 * a custom state machine on top of the socket relay.
 */
export class CallPeer {
  constructor({
    polite = false,
    sendSignal,
    onConnected,
    onDisconnected,
    onFailed,
    onRemoteStream,
    onStats,
  } = {}) {
    this.polite = polite;
    this.sendSignal = sendSignal ?? (() => Promise.resolve());
    this.onConnected = onConnected;
    this.onDisconnected = onDisconnected;
    this.onFailed = onFailed;
    this.onRemoteStream = onRemoteStream;
    this.onStats = onStats;

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, bundlePolicy: 'max-bundle' });
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.isSettingRemoteAnswerPending = false;
    this.pendingIce = [];
    this.senders = { audio: null, video: null };
    this.closed = false;
    this.statsTimer = null;
    this.previousStats = null;
    this.disconnectTimer = null;

    this.pc.onicecandidate = ({ candidate }) => {
      if (!candidate || this.closed) return;
      Promise.resolve(this.sendSignal('ice', candidate.toJSON())).catch(() => {});
    };

    this.pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) this.onRemoteStream?.(stream);
    };

    this.pc.onnegotiationneeded = async () => {
      if (this.closed) return;
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        await this.sendSignal('offer', safeJson(this.pc.localDescription));
      } catch {
        // A simultaneous answer or a closed connection can cancel this safely.
      } finally {
        this.makingOffer = false;
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      if (state === 'connected') {
        clearTimeout(this.disconnectTimer);
        this.disconnectTimer = null;
        this.startStats();
        this.onConnected?.();
      } else if (state === 'failed') {
        this.stopStats();
        this.onFailed?.('connection_failed');
      } else if (state === 'disconnected') {
        this.stopStats();
        clearTimeout(this.disconnectTimer);
        this.disconnectTimer = setTimeout(() => {
          if (this.pc.connectionState === 'disconnected') this.onDisconnected?.();
        }, DISCONNECT_GRACE_MS);
      }
    };
  }

  get connectionState() {
    return this.pc.connectionState;
  }

  addStream(stream) {
    for (const track of stream.getTracks()) {
      if (this.senders[track.kind]) continue;
      this.senders[track.kind] = this.pc.addTrack(track, stream);
    }
  }

  async replaceVideoTrack(track) {
    const sender = this.senders.video;
    if (sender) {
      await sender.replaceTrack(track ?? null);
      return;
    }
    if (track) {
      this.senders.video = this.pc.addTrack(track, new MediaStream([track]));
    }
  }

  async negotiate() {
    if (this.closed) return;
    try {
      this.makingOffer = true;
      await this.pc.setLocalDescription();
      await this.sendSignal('offer', safeJson(this.pc.localDescription));
    } finally {
      this.makingOffer = false;
    }
  }

  async flushIce() {
    if (!this.pendingIce.length) return;
    const queued = this.pendingIce.splice(0);
    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(candidate ? new RTCIceCandidate(candidate) : null);
      } catch {
        // Late candidates for a rolled-back offer are expected; ignore them.
      }
    }
  }

  async handleSignal({ type, data }) {
    if (this.closed) return;

    if (type === 'offer' || type === 'answer') {
      if (!data?.type || !data?.sdp) return;

      const readyForOffer =
        !this.makingOffer &&
        (this.pc.signalingState === 'stable' || this.isSettingRemoteAnswerPending);
      const offerCollision = data.type === 'offer' && !readyForOffer;

      this.ignoreOffer = !this.polite && offerCollision;
      if (this.ignoreOffer) return;

      this.isSettingRemoteAnswerPending = data.type === 'answer';
      try {
        await this.pc.setRemoteDescription(data);
      } finally {
        this.isSettingRemoteAnswerPending = false;
      }

      if (data.type === 'offer') {
        await this.flushIce();
        await this.pc.setLocalDescription();
        await this.sendSignal('answer', safeJson(this.pc.localDescription));
      }
      return;
    }

    if (type === 'ice') {
      if (!this.pc.remoteDescription) {
        this.pendingIce.push(data);
        return;
      }
      try {
        await this.pc.addIceCandidate(data ? new RTCIceCandidate(data) : null);
      } catch (error) {
        if (!this.ignoreOffer) throw error;
      }
      return;
    }

    if (type === 'renegotiate' && !this.polite) {
      await this.negotiate();
    }
  }

  startStats() {
    if (this.statsTimer) return;
    this.sampleStats().catch(() => {});
    this.statsTimer = setInterval(() => {
      this.sampleStats().catch(() => {});
    }, STATS_INTERVAL_MS);
  }

  stopStats() {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  async sampleStats() {
    if (this.closed) return;
    const report = await this.pc.getStats();
    let inbound = null;
    let pair = null;
    let transport = null;

    report.forEach((entry) => {
      if (entry.type === 'inbound-rtp' && entry.kind) {
        if (!inbound || (entry.kind === 'video' && inbound.kind !== 'video')) inbound = entry;
      }
      if (entry.type === 'transport' && entry.selectedCandidatePairId) transport = entry;
      if (entry.type === 'candidate-pair' && entry.state === 'succeeded' && entry.nominated) {
        pair = entry;
      }
    });

    if (!pair && transport?.selectedCandidatePairId) {
      pair = report.get(transport.selectedCandidatePairId) ?? null;
    }

    const rttMs =
      pair?.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null;
    const now = performance.now();
    let bitrateKbps = null;
    let packetLossPct = null;

    if (inbound) {
      const bytes = inbound.bytesReceived ?? 0;
      const received = inbound.packetsReceived ?? 0;
      const lost = inbound.packetsLost ?? 0;

      if (this.previousStats && now > this.previousStats.at) {
        const seconds = (now - this.previousStats.at) / 1000;
        bitrateKbps = Math.max(
          0,
          Math.round(((bytes - this.previousStats.bytes) * 8) / seconds / 1000),
        );
        const deltaReceived = received - this.previousStats.received;
        const deltaLost = lost - this.previousStats.lost;
        const total = deltaReceived + deltaLost;
        if (total > 0) packetLossPct = Math.round((deltaLost / total) * 1000) / 10;
      }

      this.previousStats = { at: now, bytes, received, lost };
    }

    this.onStats?.({
      bitrateKbps,
      packetLossPct,
      rttMs,
      quality: qualityLabel({ rttMs, packetLossPct }),
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.stopStats();
    clearTimeout(this.disconnectTimer);
    this.pendingIce = [];
    try {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.onnegotiationneeded = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
    } catch {
      // Closing an already-closed peer is harmless.
    }
  }
}

export function stopStream(stream) {
  stream?.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // Ignore tracks that are already ended.
    }
  });
}

export function mediaErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera or microphone access was blocked. Allow it in your browser settings and try again.';
    case 'NotFoundError':
      return 'No camera or microphone was found on this device.';
    case 'NotReadableError':
      return 'Your camera or microphone is already in use by another app.';
    case 'OverconstrainedError':
      return 'This device cannot provide the requested camera or microphone.';
    default:
      return 'We could not access your camera or microphone.';
  }
}
