import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Ban,
  Check,
  CheckCheck,
  Clock3,
  Copy,
  CornerUpRight,
  Download,
  FileText,
  MoreVertical,
  Pause,
  Pencil,
  Pin,
  PinOff,
  Play,
  Reply,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Avatar, Spinner } from '../ui/Primitives';
import { useUiStore } from '../../stores/uiStore';
import { useClickOutside } from '../../hooks/useClickOutside';
import {
  cn,
  formatBytes,
  formatDuration,
  formatTime,
  isImageAttachment,
  mediaUrl,
  messagePreview,
  splitLinks,
} from '../../lib/utils';
import { getSticker } from '../../lib/stickers';
import styles from './MessageBubble.module.css';

function TextBody({ text }) {
  return (
    <p className={styles.text}>
      {splitLinks(text ?? '').map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">
            {part}
          </a>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </p>
  );
}

function Sticker({ message }) {
  const sticker = getSticker(message.body);
  return (
    <div className={styles.stickerWrap}>
      <span
        className={styles.sticker}
        data-tint={sticker.tint}
        role="img"
        aria-label={`${sticker.label} sticker`}
        title={sticker.label}
      >
        {sticker.emoji}
      </span>
    </div>
  );
}

function WaveBars({ progress = 0, bars = 30 }) {
  return (
    <span className={styles.waveBars} aria-hidden="true">
      {Array.from({ length: bars }).map((_, index) => {
        const height = 5 + ((index * 7 + 11) % 15);
        return (
          <i
            key={index}
            style={{ height }}
            className={index / bars <= progress ? styles.wavePlayed : undefined}
          />
        );
      })}
    </span>
  );
}

function VoiceNote({ attachment }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState((attachment.durationMs ?? 0) / 1000 || 0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
  }, [attachment.id]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    try {
      setLoading(true);
      await audio.play();
    } catch {
      toast.error('This voice note could not be played.');
    } finally {
      setLoading(false);
    }
  };

  const scrub = (event) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setCurrent(audio.currentTime);
  };

  const progress = duration ? Math.min(1, current / duration) : 0;

  return (
    <div className={styles.voice}>
      <audio
        ref={audioRef}
        src={mediaUrl(attachment.url)}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          if (Number.isFinite(event.currentTarget.duration)) {
            setDuration(event.currentTarget.duration);
          }
        }}
      />
      <button
        type="button"
        className={styles.voiceButton}
        onClick={toggle}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
      >
        {loading ? <Spinner size={16} /> : playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <button
        type="button"
        className={styles.waveButton}
        onClick={scrub}
        aria-label="Seek voice note"
      >
        <WaveBars progress={progress} />
      </button>
      <span className={styles.voiceTime}>{formatDuration(current || duration)}</span>
    </div>
  );
}

function ImageGrid({ attachments }) {
  const openLightbox = useUiStore((state) => state.openLightbox);
  const images = useMemo(
    () =>
      attachments.map((attachment) => ({
        ...attachment,
        url: mediaUrl(attachment.url),
      })),
    [attachments],
  );

  const open = (index) => openLightbox(images, index);

  return (
    <div
      className={cn(
        styles.images,
        images.length === 1 && styles.imagesSingle,
        images.length >= 3 && styles.imagesMany,
      )}
    >
      {images.map((image, index) => (
        <button
          key={image.id}
          type="button"
          className={styles.imageButton}
          onClick={() => open(index)}
          aria-label={`Open ${image.name || 'photo'}`}
        >
          <img src={image.url} alt={image.name || 'Shared photo'} loading="lazy" />
        </button>
      ))}
    </div>
  );
}

function FileList({ attachments }) {
  return (
    <div className={styles.files}>
      {attachments.map((attachment) => (
        <a
          key={attachment.id}
          className={styles.file}
          href={mediaUrl(attachment.url)}
          target="_blank"
          rel="noreferrer"
          download={attachment.name}
        >
          <span className={styles.fileIcon}>
            <FileText size={18} />
          </span>
          <span className={styles.fileText}>
            <strong>{attachment.name || 'Attachment'}</strong>
            <span>{formatBytes(attachment.sizeBytes)}</span>
          </span>
          <Download size={15} className={styles.fileDownload} />
        </a>
      ))}
    </div>
  );
}

function Receipt({ message, own }) {
  if (!own) return null;
  if (message.pending)
    return <Clock3 size={12} className={styles.receiptPending} aria-label="Sending" />;
  if (message.failed)
    return <AlertCircle size={12} className={styles.receiptFailed} aria-label="Not sent" />;

  const other = message.receipts?.find((receipt) => receipt.userId !== message.sender?.id);
  if (!other?.deliveredAt) return <Check size={12} className={styles.receipt} aria-label="Sent" />;
  if (other.readAt)
    return <CheckCheck size={12} className={styles.receiptRead} aria-label="Seen" />;
  return <CheckCheck size={12} className={styles.receipt} aria-label="Delivered" />;
}

export function MessageBubble({
  message,
  own,
  showAvatar = true,
  isLastInGroup = true,
  canMessage = true,
  highlighted = false,
  onReply,
  onEdit,
  onDelete,
  onPin,
  onUnpin,
  onForward,
  onRetry,
  onJumpTo,
  registerRef,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useClickOutside(() => setMenuOpen(false), menuOpen);
  const deleted = Boolean(message.deletedAt);
  const pending = Boolean(message.pending);
  const failed = Boolean(message.failed);

  const images = (message.attachments ?? []).filter(isImageAttachment);
  const files = (message.attachments ?? []).filter(
    (attachment) => !isImageAttachment(attachment) && !/^audio\//.test(attachment.mimeType || ''),
  );
  const voice = (message.attachments ?? []).find((attachment) =>
    /^audio\//.test(attachment.mimeType || ''),
  );

  const closeMenu = () => setMenuOpen(false);

  const run = (action) => {
    closeMenu();
    action?.();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.body ?? '');
      toast.success('Message copied.');
    } catch {
      toast.error('Copying is not available in this browser.');
    }
  };

  return (
    <div
      ref={registerRef}
      className={cn(
        styles.row,
        own ? styles.own : styles.received,
        !showAvatar && styles.continuation,
        highlighted && styles.highlighted,
        failed && styles.failedRow,
      )}
      data-message-id={message.id}
    >
      <div className={styles.avatarSlot}>
        {!own && showAvatar ? (
          <Avatar user={message.sender} size="sm" />
        ) : !own && !showAvatar ? (
          <span className={styles.avatarSpacer} />
        ) : null}
      </div>

      <div className={styles.stack}>
        {message.forwardedFromId && !deleted ? (
          <span className={styles.forwarded}>
            <CornerUpRight size={12} /> Forwarded
          </span>
        ) : null}

        <div
          className={cn(
            styles.bubble,
            own ? styles.bubbleOwn : styles.bubbleReceived,
            !isLastInGroup && styles.bubbleGrouped,
            deleted && styles.bubbleDeleted,
            message.type === 'sticker' && styles.bubbleSticker,
            pending && styles.bubblePending,
            failed && styles.bubbleFailed,
          )}
        >
          {deleted ? (
            <p className={styles.deleted}>
              <Ban size={13} /> This message was deleted
            </p>
          ) : (
            <>
              {message.replyTo ? (
                <button
                  type="button"
                  className={styles.replyQuote}
                  onClick={() => onJumpTo?.(message.replyTo.id, message.replyTo.seq)}
                >
                  <span className={styles.replyBar} />
                  <span>
                    <strong>{message.replyTo.sender?.displayName ?? 'Reply'}</strong>
                    <span>
                      {message.replyTo.deleted
                        ? 'Message deleted'
                        : messagePreview(message.replyTo)}
                    </span>
                  </span>
                </button>
              ) : null}

              {images.length ? <ImageGrid attachments={images} /> : null}

              {voice ? <VoiceNote attachment={voice} /> : null}

              {files.length ? <FileList attachments={files} /> : null}

              {message.type === 'sticker' ? <Sticker message={message} /> : null}

              {message.type !== 'sticker' && message.body ? <TextBody text={message.body} /> : null}

              {!images.length &&
              !files.length &&
              !voice &&
              message.type !== 'sticker' &&
              !message.body ? (
                <p className={styles.emptyBody}>Empty message</p>
              ) : null}
            </>
          )}

          <span className={cn(styles.footer, own ? styles.footerOwn : styles.footerReceived)}>
            {message.isPinned && !deleted ? (
              <Pin size={10} className={styles.pinnedIcon} aria-label="Pinned message" />
            ) : null}
            {message.editedAt && !deleted ? <span className={styles.edited}>edited</span> : null}
            {failed ? (
              <button type="button" className={styles.retry} onClick={() => onRetry?.(message)}>
                <RotateCcw size={11} /> Retry
              </button>
            ) : (
              <span className={styles.time}>{formatTime(message.createdAt)}</span>
            )}
            <Receipt message={message} own={own} />
          </span>

          {!pending && !deleted ? (
            <div className={styles.menuWrap} ref={menuRef}>
              <button
                type="button"
                className={styles.menuButton}
                onClick={() => setMenuOpen((open) => !open)}
                aria-label="Message actions"
                aria-expanded={menuOpen}
              >
                <MoreVertical size={15} />
              </button>
              {menuOpen ? (
                <div
                  className={cn(styles.menu, own ? styles.menuOwn : styles.menuReceived)}
                  role="menu"
                >
                  {message.body && message.type !== 'sticker' && !deleted ? (
                    <button type="button" role="menuitem" onClick={() => run(copy)}>
                      <Copy size={14} /> Copy text
                    </button>
                  ) : null}
                  {!deleted ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => run(() => onReply?.(message))}
                    >
                      <Reply size={14} /> Reply
                    </button>
                  ) : null}
                  {!deleted ? (
                    message.isPinned ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => run(() => onUnpin?.(message))}
                      >
                        <PinOff size={14} /> Unpin
                      </button>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => run(() => onPin?.(message))}
                      >
                        <Pin size={14} /> Pin message
                      </button>
                    )
                  ) : null}
                  {!deleted ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => run(() => onForward?.(message))}
                    >
                      <CornerUpRight size={14} /> Forward
                    </button>
                  ) : null}
                  {own && !deleted && message.type === 'text' ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => run(() => onEdit?.(message))}
                      disabled={!canMessage}
                    >
                      <Pencil size={14} /> Edit
                    </button>
                  ) : null}
                  {own && !deleted ? (
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.deleteItem}
                      onClick={() => run(() => onDelete?.(message))}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
