import { create } from 'zustand';
import toast from 'react-hot-toast';
import { createNoiseGate } from '../lib/audio';
import { emitWithAck } from '../lib/socket';
import {
  CallPeer,
  mediaErrorMessage,
  requestDisplayMedia,
  screenCaptureErrorMessage,
  stopStream,
} from '../lib/webrtc';
import { startRingtone, vibrate } from '../lib/utils';
import { useAuthStore } from './authStore';

const idleState = {
  status: 'idle',
  call: null,
  peerUser: null,
  kind: 'audio',
  localStream: null,
  remoteStream: null,
  micEnabled: true,
  camEnabled: true,
  sharing: false,
  facingMode: 'user',
  quality: null,
  startedAt: null,
  endingReason: null,
  error: null,
  minimized: false,
  remoteMedia: { audioEnabled: true, videoEnabled: true, sharing: false },
};

let peer = null;
let audioTrack = null;
let cameraTrack = null;
let screenTrack = null;
let screenStream = null;
let stoppingShare = false;
let localStream = null;
let rawStream = null;
let noiseGate = null;
let ringStop = null;
let pendingSignals = [];
let resetTimer = null;

function stopRing() {
  if (ringStop) {
    ringStop();
    ringStop = null;
  }
}

function clearResetTimer() {
  clearTimeout(resetTimer);
  resetTimer = null;
}

function peerOf(call, meId) {
  if (!call) return null;
  return call.caller.id === meId ? call.callee : call.caller;
}

function activeVideoTrack() {
  return screenTrack ?? cameraTrack;
}

function rebuildLocalStream(setState) {
  const tracks = [audioTrack, activeVideoTrack()].filter(Boolean);
  localStream = tracks.length ? new MediaStream(tracks) : null;
  setState({ localStream });
}

function cleanupMedia() {
  noiseGate?.cleanup();
  noiseGate = null;
  stopStream(localStream);
  stopStream(rawStream);
  if (screenStream) stopStream(screenStream);
  if (screenTrack) stopStream(new MediaStream([screenTrack]));
  screenStream = null;
  screenTrack = null;
  stoppingShare = false;
  cameraTrack = null;
  audioTrack = null;
  localStream = null;
  rawStream = null;
}

function cleanupCall() {
  stopRing();
  if (peer) {
    peer.close();
    peer = null;
  }
  pendingSignals = [];
  cleanupMedia();
}

async function acquireMedia(kind, facingMode) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not support camera or microphone access.');
  }

  rawStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
      channelCount: { ideal: 1 },
    },
    video:
      kind === 'video'
        ? {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: { ideal: facingMode },
          }
        : false,
  });

  noiseGate = createNoiseGate(rawStream);
  audioTrack = noiseGate?.track ?? rawStream.getAudioTracks()[0] ?? null;
  cameraTrack = rawStream.getVideoTracks()[0] ?? null;
  localStream = new MediaStream([audioTrack, cameraTrack].filter(Boolean));
  return localStream;
}

async function relaySignal(type, data) {
  const { call } = useCallStore.getState();
  if (!call) return;
  try {
    await emitWithAck('call:signal', { callId: call.id, type, data });
  } catch {
    // A transient signal failure is recovered by the next negotiation.
  }
}

export const useCallStore = create((set, get) => ({
  ...idleState,

  prepareMedia: async (kind) => {
    if (localStream) return localStream;
    try {
      const stream = await acquireMedia(kind, get().facingMode);
      set({ localStream: stream });
      return stream;
    } catch (error) {
      throw new Error(mediaErrorMessage(error));
    }
  },

  startCall: async (chat, kind = 'video') => {
    const current = get().status;
    if (!['idle', 'ended'].includes(current)) return null;

    clearResetTimer();
    stopRing();
    set({ ...idleState, status: 'outgoing', kind, error: null });

    try {
      await get().prepareMedia(kind);
    } catch (error) {
      set({ ...idleState });
      toast.error(error.message);
      return null;
    }

    try {
      const call = await emitWithAck('call:start', { chatId: chat.id, kind });
      const me = useAuthStore.getState().user;
      set({
        status: 'outgoing',
        call,
        kind: call.kind,
        peerUser: peerOf(call, me?.id),
        startedAt: null,
      });
      // Start negotiation while the call is ringing so ICE gathering overlaps
      // the wait for the other person to answer instead of starting afterwards.
      get().createPeer(call);
      ringStop = startRingtone('outgoing');
      vibrate(60);
      return call;
    } catch (error) {
      cleanupCall();
      set({ ...idleState });
      toast.error(error.message || 'The call could not be started.');
      return null;
    }
  },

  handleIncoming: (call) => {
    const state = get();
    if (!['idle', 'ended'].includes(state.status)) {
      emitWithAck('call:reject', { callId: call.id }).catch(() => {});
      toast('You are already on another call.', { icon: '📞' });
      return;
    }
    const me = useAuthStore.getState().user;
    if (!me || (call.caller.id !== me.id && call.callee.id !== me.id)) return;

    clearResetTimer();
    stopRing();
    set({
      ...idleState,
      status: 'incoming',
      call,
      kind: call.kind,
      peerUser: peerOf(call, me.id),
    });
    ringStop = startRingtone('incoming');
    vibrate([220, 120, 220]);
  },

  acceptCall: async () => {
    const { call, status } = get();
    if (!call || status !== 'incoming') return;

    stopRing();
    try {
      await get().prepareMedia(call.kind);
    } catch (error) {
      emitWithAck('call:reject', { callId: call.id }).catch(() => {});
      cleanupCall();
      set({ ...idleState });
      toast.error(error.message);
      return;
    }

    try {
      const accepted = await emitWithAck('call:accept', { callId: call.id });
      const me = useAuthStore.getState().user;
      const active = accepted ?? call;
      set({
        status: 'connecting',
        call: active,
        peerUser: peerOf(active, me?.id),
      });
      get().createPeer(active);
    } catch (error) {
      cleanupCall();
      set({ ...idleState });
      toast.error(error.message || 'The call could not be answered.');
    }
  },

  createPeer: (call) => {
    if (peer) return peer;
    const me = useAuthStore.getState().user;
    if (!me) return null;

    const polite = call.callee.id === me.id;
    const connection = new CallPeer({
      polite,
      sendSignal: relaySignal,
      onConnected: () => {
        const state = get();
        if (!state.call || state.call.id !== call.id) return;
        set({
          status: 'ongoing',
          startedAt: state.call.answeredAt ?? new Date().toISOString(),
        });
      },
      onDisconnected: () => get().failCall('connection_failed'),
      onFailed: () => get().failCall('connection_failed'),
      onRemoteStream: (stream) => set({ remoteStream: stream }),
      onStats: (quality) => set({ quality }),
    });

    peer = connection;
    if (localStream) connection.addStream(localStream);

    const queued = pendingSignals;
    pendingSignals = [];
    for (const signal of queued) {
      connection.handleSignal({ type: signal.type, data: signal.data }).catch(() => {});
    }
    return connection;
  },

  handleAccepted: (call) => {
    const state = get();
    if (!state.call || state.call.id !== call.id) return;
    stopRing();
    const me = useAuthStore.getState().user;
    set({
      call,
      peerUser: peerOf(call, me?.id),
      status: state.status === 'ongoing' ? 'ongoing' : 'connecting',
      startedAt: state.startedAt ?? call.answeredAt ?? null,
    });
    get().createPeer(call);
  },

  handleSignal: (payload) => {
    const state = get();
    if (!state.call || state.call.id !== payload.callId) return;
    if (!peer) {
      pendingSignals.push(payload);
      return;
    }
    peer.handleSignal({ type: payload.type, data: payload.data }).catch(() => {
      // Renegotiation collisions resolve themselves on the next attempt.
    });
  },

  handleEnded: (call, reason) => {
    const state = get();
    if (state.status === 'idle') return;
    if (state.call && call && state.call.id !== call.id) return;
    get().finalize(reason ?? 'completed');
  },

  failCall: (reason = 'connection_failed') => {
    const { call, status } = get();
    if (!call || ['idle', 'ended'].includes(status)) return;
    emitWithAck('call:fail', { callId: call.id, reason }).catch(() => {});
    get().finalize('connection_failed');
  },

  endCall: async () => {
    const { call, status } = get();
    if (!call || ['idle', 'ended'].includes(status)) {
      get().reset();
      return;
    }
    try {
      await emitWithAck('call:end', { callId: call.id, reason: 'hangup' });
    } catch {
      // The other side may have hung up first.
    }
    get().finalize('ended');
  },

  rejectCall: async () => {
    const { call } = get();
    if (!call) return;
    emitWithAck('call:reject', { callId: call.id }).catch(() => {});
    get().finalize('declined');
  },

  cancelCall: async () => {
    const { call } = get();
    if (!call) return;
    emitWithAck('call:cancel', { callId: call.id }).catch(() => {});
    get().finalize('cancelled');
  },

  finalize: (reason) => {
    if (get().status === 'ended' && !peer) return;
    cleanupCall();
    const labels = {
      connection_failed: 'Connection lost',
      declined: 'Call declined',
      cancelled: 'Call cancelled',
      missed: 'Missed call',
      completed: 'Call ended',
      disconnected: 'Call ended',
      ended: 'Call ended',
    };
    set({
      status: 'ended',
      endingReason: labels[reason] ?? 'Call ended',
      localStream: null,
      remoteStream: null,
      sharing: false,
      quality: null,
      micEnabled: true,
      camEnabled: true,
    });
    clearResetTimer();
    resetTimer = setTimeout(() => {
      if (get().status === 'ended') get().reset();
    }, 2600);
  },

  dismiss: () => {
    clearResetTimer();
    get().reset();
  },

  reset: () => {
    clearResetTimer();
    cleanupCall();
    set({ ...idleState, remoteMedia: { ...idleState.remoteMedia } });
  },

  toggleMic: () => {
    const enabled = !get().micEnabled;
    if (audioTrack) audioTrack.enabled = enabled;
    set({ micEnabled: enabled });
    relaySignal('media', { kind: 'audio', enabled });
  },

  toggleCamera: () => {
    const enabled = !get().camEnabled;
    const track = activeVideoTrack();
    if (track) track.enabled = enabled;
    set({ camEnabled: enabled });
    relaySignal('media', { kind: 'video', enabled });
  },

  switchCamera: async () => {
    if (get().sharing || get().kind !== 'video' || !cameraTrack) return;
    const next = get().facingMode === 'user' ? 'environment' : 'user';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: next } },
      });
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      track.enabled = get().camEnabled;
      const previous = cameraTrack;
      cameraTrack = track;
      rebuildLocalStream(set);
      await peer?.replaceVideoTrack(track);
      if (previous) stopStream(new MediaStream([previous]));
      set({ facingMode: next });
    } catch (error) {
      toast.error(mediaErrorMessage(error));
    }
  },

  toggleScreenShare: async () => {
    if (get().sharing) {
      await get().stopScreenShare();
      return;
    }

    // Ask the browser directly. A cached "unsupported" flag can be wrong (the
    // API may only appear after a user gesture), so the real call is the only
    // reliable answer — just like the reference implementation.
    let stream;
    try {
      stream = await requestDisplayMedia({ video: true, audio: false });
    } catch (error) {
      toast.error(screenCaptureErrorMessage(error));
      return;
    }

    const track = stream.getVideoTracks()[0];
    if (!track) {
      stopStream(stream);
      toast.error('No screen was selected. Try sharing again.');
      return;
    }

    try {
      track.enabled = true;
      screenStream = stream;
      screenTrack = track;
      // The browser fires "ended" when the user stops sharing from its own UI.
      // Restore the camera for every peer instead of leaving them with a frozen
      // frame — the same lifecycle the reference app uses.
      track.addEventListener('ended', () => {
        if (get().sharing) get().stopScreenShare();
      });
      rebuildLocalStream(set);
      await peer?.replaceVideoTrack(track);
      set({ sharing: true });
      relaySignal('media', { kind: 'screen', enabled: true });
    } catch {
      stopStream(stream);
      screenStream = null;
      screenTrack = null;
      rebuildLocalStream(set);
      toast.error('Screen sharing could not be started. Try again.');
    }
  },

  stopScreenShare: async () => {
    if (stoppingShare) return;
    stoppingShare = true;
    try {
      const wasSharing = get().sharing;
      if (screenStream) stopStream(screenStream);
      else if (screenTrack) stopStream(new MediaStream([screenTrack]));
      screenStream = null;
      screenTrack = null;
      rebuildLocalStream(set);
      await peer?.replaceVideoTrack(cameraTrack ?? null);
      set({ sharing: false });
      if (wasSharing) {
        relaySignal('media', { kind: 'screen', enabled: false });
        relaySignal('media', { kind: 'video', enabled: get().camEnabled });
      }
    } finally {
      stoppingShare = false;
    }
  },

  applyRemoteMedia: ({ kind, enabled }) => {
    set((state) => {
      const remoteMedia = { ...state.remoteMedia };
      if (kind === 'audio') remoteMedia.audioEnabled = Boolean(enabled);
      if (kind === 'video') remoteMedia.videoEnabled = Boolean(enabled);
      if (kind === 'screen') {
        remoteMedia.sharing = Boolean(enabled);
        remoteMedia.videoEnabled = Boolean(enabled);
      }
      return { remoteMedia };
    });
  },

  minimize: (minimized) => set({ minimized }),
}));
