import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AudioLines,
  Check,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  Phone,
  PhoneOff,
  RefreshCw,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import { Avatar, IconButton } from '../ui/Primitives';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { cn, formatCallDuration, presenceLabel } from '../../lib/utils';
import { usePresenceStore } from '../../stores/presenceStore';
import styles from './CallOverlay.module.css';

const QUALITY_LABELS = {
  connecting: 'Connecting',
  excellent: 'Excellent',
  good: 'Good',
  poor: 'Weak signal',
};

function useElapsed(startedAt) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  if (!startedAt) return 0;
  return Math.max(0, (now - new Date(startedAt).getTime()) / 1000);
}

function MediaVideo({ stream, muted = false, className, ...rest }) {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = stream ?? null;
    if (stream) element.play?.().catch(() => {});
  }, [stream]);

  return <video ref={ref} className={className} autoPlay playsInline muted={muted} {...rest} />;
}

function MediaAudio({ stream }) {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = stream ?? null;
    if (stream) element.play?.().catch(() => {});
  }, [stream]);

  return <audio ref={ref} autoPlay />;
}

function Waveform({ active }) {
  return (
    <div className={cn(styles.wave, active && styles.waveActive)} aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((bar) => (
        <span key={bar} style={{ animationDelay: `${bar * 70}ms` }} />
      ))}
    </div>
  );
}

function ControlButton({ label, active, tone, onClick, children, disabled, className }) {
  return (
    <button
      type="button"
      className={cn(
        styles.control,
        active && styles.controlActive,
        tone === 'danger' && styles.controlDanger,
        tone === 'end' && styles.controlEnd,
        tone === 'accept' && styles.controlAccept,
        className,
      )}
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

export function CallOverlay() {
  const status = useCallStore((state) => state.status);
  const call = useCallStore((state) => state.call);
  const peerUser = useCallStore((state) => state.peerUser);
  const kind = useCallStore((state) => state.kind);
  const localStream = useCallStore((state) => state.localStream);
  const remoteStream = useCallStore((state) => state.remoteStream);
  const micEnabled = useCallStore((state) => state.micEnabled);
  const camEnabled = useCallStore((state) => state.camEnabled);
  const sharing = useCallStore((state) => state.sharing);
  const facingMode = useCallStore((state) => state.facingMode);
  const quality = useCallStore((state) => state.quality);
  const startedAt = useCallStore((state) => state.startedAt);
  const endingReason = useCallStore((state) => state.endingReason);
  const remoteMedia = useCallStore((state) => state.remoteMedia);
  const minimized = useCallStore((state) => state.minimized);

  const me = useAuthStore((state) => state.user);
  const presence = usePresenceStore((state) => state.byId);
  const elapsed = useElapsed(startedAt);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef(null);

  const active = ['incoming', 'outgoing', 'connecting', 'ongoing', 'ended'].includes(status);
  const isVideo = kind === 'video';
  const showStage = !['incoming', 'outgoing', 'ended'].includes(status);
  const peerPresence = presence[peerUser?.id];

  useEffect(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    if (status !== 'ongoing' || minimized) return undefined;
    hideTimer.current = setTimeout(() => setControlsVisible(false), 4200);
    return () => clearTimeout(hideTimer.current);
  }, [status, minimized, micEnabled, camEnabled]);

  const qualityText = useMemo(() => {
    if (!quality) return null;
    return QUALITY_LABELS[quality.quality] ?? 'Connected';
  }, [quality]);

  if (!active) return null;

  const reveal = () => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (useCallStore.getState().status === 'ongoing') setControlsVisible(false);
    }, 4200);
  };

  const peerName = peerUser?.displayName ?? 'DuoConnect';
  const peerStatus = peerPresence
    ? presenceLabel(peerPresence.status, peerPresence.lastSeenAt)
    : peerUser?.status === 'online'
      ? 'Online now'
      : 'Ripple';

  const statusLine =
    status === 'incoming'
      ? `Incoming ${kind} call`
      : status === 'outgoing'
        ? 'Calling…'
        : status === 'connecting'
          ? 'Connecting securely…'
          : status === 'ended'
            ? (endingReason ?? 'Call ended')
            : formatCallDuration(elapsed);

  const remoteVideoOn = !isVideo
    ? false
    : Boolean(remoteStream) && remoteMedia.videoEnabled !== false;
  const localVideoOn = isVideo && localStream && (camEnabled || sharing);
  const canControl = ['connecting', 'ongoing'].includes(status);

  if (status === 'ended') {
    return (
      <div className={styles.endedWrap}>
        <motion.div
          className={styles.ended}
          initial={{ opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          role="status"
        >
          <Avatar user={peerUser} size="xl" ring />
          <strong>{peerName}</strong>
          <span>{endingReason ?? 'Call ended'}</span>
          <button
            type="button"
            className={styles.endedButton}
            onClick={() => useCallStore.getState().dismiss()}
          >
            <Check size={16} /> Done
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        className={cn(styles.overlay, minimized && styles.overlayMinimized)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseMove={reveal}
        onTouchStart={reveal}
        role="dialog"
        aria-modal="true"
        aria-label={statusLine}
      >
        {minimized ? (
          <div className={styles.dock}>
            <button
              type="button"
              className={styles.dockIdentity}
              onClick={() => useCallStore.getState().minimize(false)}
              aria-label="Expand call"
            >
              <span className={styles.dockAvatar}>
                <Avatar
                  user={peerUser}
                  size="sm"
                  showStatus
                  status={peerPresence?.status ?? peerUser?.status}
                />
                <i className={styles.dockPulse} aria-hidden="true" />
              </span>
              <span>
                <strong>{peerName}</strong>
                <small>{statusLine}</small>
              </span>
            </button>
            <div className={styles.dockActions}>
              <IconButton
                label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
                size="sm"
                active={!micEnabled}
                onClick={() => useCallStore.getState().toggleMic()}
              >
                {micEnabled ? <Mic size={15} /> : <MicOff size={15} />}
              </IconButton>
              <button
                type="button"
                className={styles.dockEnd}
                onClick={() => useCallStore.getState().endCall()}
                aria-label="End call"
              >
                <PhoneOff size={16} />
              </button>
              <IconButton
                label="Expand call"
                size="sm"
                onClick={() => useCallStore.getState().minimize(false)}
              >
                <Maximize2 size={15} />
              </IconButton>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.backdrop} aria-hidden="true" />
            <div className={styles.stage}>
              {showStage ? (
                <>
                  {isVideo && remoteStream ? (
                    <MediaVideo
                      stream={remoteStream}
                      className={cn(styles.remoteVideo, !remoteVideoOn && styles.remoteVideoHidden)}
                    />
                  ) : null}

                  {!isVideo && remoteStream ? <MediaAudio stream={remoteStream} /> : null}

                  {!remoteVideoOn ? (
                    <div className={styles.avatarStage}>
                      <div className={styles.halo} aria-hidden="true" />
                      <motion.div
                        animate={status === 'ongoing' ? { scale: [1, 1.035, 1] } : { scale: 1 }}
                        transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
                        className={styles.avatarOrb}
                      >
                        <Avatar user={peerUser} size={148} ring />
                      </motion.div>
                      {!isVideo ? <Waveform active={remoteMedia.audioEnabled} /> : null}
                      <h2 className={styles.peerName}>{peerName}</h2>
                      <p className={styles.peerStatus}>{statusLine}</p>
                      <div className={styles.stageTags}>
                        {!isVideo && remoteMedia.audioEnabled ? (
                          <span className={styles.audioTag}>
                            <AudioLines size={13} /> Audio connected
                          </span>
                        ) : null}
                        {remoteMedia.sharing ? (
                          <span className={styles.shareTag}>
                            <MonitorUp size={13} /> Screen sharing
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {localVideoOn ? (
                    <motion.div
                      className={cn(styles.localTile, sharing && styles.localTileSharing)}
                      initial={{ opacity: 0, y: 18, scale: 0.94 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                    >
                      <MediaVideo stream={localStream} muted className={styles.localVideo} />
                      <span className={styles.localLabel}>
                        {sharing ? <MonitorUp size={12} /> : <Video size={12} />}
                        {sharing ? 'Your screen' : 'You'}
                      </span>
                    </motion.div>
                  ) : isVideo && !sharing ? (
                    <div className={styles.localPlaceholder}>
                      <Avatar user={me} size="xs" />
                      <span>Camera off</span>
                    </div>
                  ) : null}

                  <header className={cn(styles.topbar, !controlsVisible && styles.topbarHidden)}>
                    <div className={styles.peerId}>
                      <Avatar
                        user={peerUser}
                        size="sm"
                        showStatus
                        status={peerPresence?.status ?? peerUser?.status}
                      />
                      <div>
                        <strong>{peerName}</strong>
                        <span>{statusLine}</span>
                      </div>
                    </div>
                    <div className={styles.topActions}>
                      {qualityText ? (
                        <span
                          className={cn(
                            styles.quality,
                            quality?.quality === 'poor' && styles.qualityPoor,
                          )}
                        >
                          <i aria-hidden="true" /> {qualityText}
                        </span>
                      ) : null}
                      {remoteMedia.sharing ? (
                        <span className={styles.topBadge}>
                          <MonitorUp size={13} /> Viewing screen
                        </span>
                      ) : null}
                      {status === 'ongoing' ? (
                        <IconButton
                          label="Minimize call"
                          size="sm"
                          className={styles.panelButton}
                          onClick={() => useCallStore.getState().minimize(true)}
                        >
                          <Minimize2 size={16} />
                        </IconButton>
                      ) : null}
                    </div>
                  </header>

                  <footer
                    className={cn(styles.controls, !controlsVisible && styles.controlsHidden)}
                  >
                    <div className={styles.controlBar}>
                      {status === 'incoming' ? (
                        <>
                          <ControlButton
                            label="Decline"
                            tone="danger"
                            onClick={() => useCallStore.getState().rejectCall()}
                          >
                            <X size={22} />
                          </ControlButton>
                          <ControlButton
                            label="Accept"
                            tone="accept"
                            onClick={() => useCallStore.getState().acceptCall()}
                          >
                            <Phone size={22} />
                          </ControlButton>
                        </>
                      ) : status === 'outgoing' ? (
                        <ControlButton
                          label="Cancel call"
                          tone="end"
                          onClick={() => useCallStore.getState().cancelCall()}
                        >
                          <PhoneOff size={22} />
                        </ControlButton>
                      ) : (
                        <>
                          <ControlButton
                            label={micEnabled ? 'Mute' : 'Unmute'}
                            active={!micEnabled}
                            onClick={() => useCallStore.getState().toggleMic()}
                          >
                            {micEnabled ? <Mic size={21} /> : <MicOff size={21} />}
                          </ControlButton>

                          {isVideo ? (
                            <ControlButton
                              label={camEnabled ? 'Camera' : 'Camera off'}
                              active={!camEnabled}
                              onClick={() => useCallStore.getState().toggleCamera()}
                            >
                              {camEnabled ? <Video size={21} /> : <VideoOff size={21} />}
                            </ControlButton>
                          ) : null}

                          {isVideo ? (
                            <ControlButton
                              label={
                                facingMode === 'user'
                                  ? 'Switch to back camera'
                                  : 'Switch to front camera'
                              }
                              className={styles.optionalControl}
                              onClick={() => useCallStore.getState().switchCamera()}
                              disabled={sharing}
                            >
                              <RefreshCw size={20} />
                            </ControlButton>
                          ) : null}

                          {isVideo ? (
                            <ControlButton
                              label={sharing ? 'Stop share' : 'Share screen'}
                              active={sharing}
                              onClick={() => useCallStore.getState().toggleScreenShare()}
                            >
                              <MonitorUp size={21} />
                            </ControlButton>
                          ) : null}

                          <ControlButton
                            label="Minimize"
                            className={styles.optionalControl}
                            onClick={() => useCallStore.getState().minimize(true)}
                          >
                            <Minimize2 size={20} />
                          </ControlButton>

                          <ControlButton
                            label="End call"
                            tone="end"
                            onClick={() => useCallStore.getState().endCall()}
                          >
                            <PhoneOff size={22} />
                          </ControlButton>
                        </>
                      )}
                    </div>

                    {canControl ? (
                      <p className={styles.controlHint}>
                        {isVideo
                          ? 'Tip: share your screen or flip the camera from the controls above.'
                          : 'Audio call · Your microphone stays under your control.'}
                      </p>
                    ) : null}
                  </footer>
                </>
              ) : (
                <div className={styles.avatarStage}>
                  <div className={styles.halo} aria-hidden="true" />
                  <motion.div
                    className={styles.avatarOrb}
                    animate={
                      status === 'outgoing'
                        ? { scale: [1, 1.04, 1], opacity: [0.9, 1, 0.9] }
                        : { scale: 1 }
                    }
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Avatar user={peerUser} size={148} ring />
                  </motion.div>
                  {status === 'outgoing' ? (
                    <div className={styles.ringDots} aria-label="Ringing">
                      <span />
                      <span />
                      <span />
                    </div>
                  ) : null}
                  <h2 className={styles.peerName}>{peerName}</h2>
                  <p className={styles.peerStatus}>{statusLine}</p>
                  {status === 'incoming' ? (
                    <p className={styles.hint}>
                      {peerUser?.username ? `@${peerUser.username}` : peerStatus}
                    </p>
                  ) : null}

                  <div className={cn(styles.controls, styles.controlsStatic)}>
                    <div className={styles.controlBar}>
                      {status === 'incoming' ? (
                        <>
                          <ControlButton
                            label="Decline"
                            tone="danger"
                            onClick={() => useCallStore.getState().rejectCall()}
                          >
                            <X size={22} />
                          </ControlButton>
                          <ControlButton
                            label="Accept"
                            tone="accept"
                            onClick={() => useCallStore.getState().acceptCall()}
                          >
                            <Phone size={22} />
                          </ControlButton>
                        </>
                      ) : (
                        <ControlButton
                          label="Cancel call"
                          tone="end"
                          onClick={() => useCallStore.getState().cancelCall()}
                        >
                          <PhoneOff size={22} />
                        </ControlButton>
                      )}
                    </div>
                    <p className={styles.controlHint}>
                      {status === 'incoming'
                        ? `Answer with ${kind === 'video' ? 'camera' : 'microphone'} when you are ready.`
                        : 'Ringing your connection…'}
                    </p>
                  </div>
                </div>
              )}

              {showStage && call ? (
                <div className={styles.callMeta} aria-hidden="true">
                  <span>{kind === 'video' ? 'Video' : 'Audio'} call</span>
                  <i />
                  <span>End-to-end media</span>
                </div>
              ) : null}
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
