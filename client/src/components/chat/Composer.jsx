import { useEffect, useRef, useState } from 'react';
import EmojiPicker from 'emoji-picker-react';
import { ArrowUp, ImagePlus, Mic, Paperclip, Pencil, Smile, Square, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Spinner } from '../ui/Primitives';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { api, unwrap } from '../../lib/api';
import { useClickOutside } from '../../hooks/useClickOutside';
import { MAX_FILE_MB, MAX_MESSAGE_LENGTH } from '../../lib/constants';
import {
  cn,
  formatCallDuration,
  formatBytes,
  getErrorMessage,
  isImageAttachment,
  mediaUrl,
} from '../../lib/utils';
import styles from './Composer.module.css';

const ACCEPTED =
  'image/jpeg,image/png,image/webp,image/gif,image/avif,application/pdf,application/zip,application/json,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,text/markdown,audio/webm,audio/ogg,audio/mpeg,audio/mp4,audio/wav,video/mp4,video/webm';

function AttachmentChip({ attachment, onRemove }) {
  const image = isImageAttachment(attachment);
  return (
    <div className={cn(styles.chip, image && styles.chipImage)}>
      {image ? (
        <img src={mediaUrl(attachment.url)} alt="" />
      ) : (
        <span className={styles.chipIcon}>
          <Paperclip size={15} />
        </span>
      )}
      <span className={styles.chipText}>
        <strong>{attachment.name}</strong>
        <span>{formatBytes(attachment.sizeBytes)}</span>
      </span>
      <button
        type="button"
        className={styles.chipRemove}
        onClick={() => onRemove(attachment.id)}
        aria-label="Remove attachment"
      >
        <X size={13} />
      </button>
    </div>
  );
}

export function Composer({
  chatId,
  chat,
  replyTo,
  editing,
  onCancelReply,
  onCancelEdit,
  onSent,
  disabled = false,
  readOnlyReason,
}) {
  const value = useChatStore((state) => state.drafts[chatId] ?? '');
  const setDraft = useChatStore((state) => state.setDraft);
  const clearDraft = useChatStore((state) => state.clearDraft);
  const notifyTyping = useChatStore((state) => state.notifyTyping);
  const stopTyping = useChatStore((state) => state.stopTyping);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const editMessage = useChatStore((state) => state.editMessage);
  const me = useAuthStore((state) => state.user);

  const [staged, setStaged] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [voiceBusy, setVoiceBusy] = useState(false);

  const inputRef = useRef(null);
  const imageRef = useRef(null);
  const fileRef = useRef(null);
  const emojiRef = useClickOutside(() => setEmojiOpen(false), emojiOpen);
  const attachRef = useClickOutside(() => setAttachOpen(false), attachOpen);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const discardRef = useRef(false);
  const timerRef = useRef(null);
  const startedRef = useRef(0);

  const canSend =
    (value.trim().length > 0 || staged.length > 0) && !sending && !uploading && !voiceBusy;

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      const length = value.length;
      requestAnimationFrame(() => inputRef.current?.setSelectionRange(length, length));
    }
  }, [editing, value.length]);

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = '0px';
    input.style.height = `${Math.min(150, Math.max(26, input.scrollHeight))}px`;
  }, [value]);

  useEffect(
    () => () => {
      clearInterval(timerRef.current);
      if (recorderRef.current?.state === 'recording') {
        discardRef.current = true;
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      stopTyping(chatId);
    },
    [chatId, stopTyping],
  );

  const change = (next) => {
    setDraft(chatId, next);
    if (next.trim()) notifyTyping(chatId);
    else stopTyping(chatId);
  };

  const insertEmoji = (emoji) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${emoji}${value.slice(end)}`;
    setDraft(chatId, next);
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      input?.focus();
      const position = start + emoji.length;
      input?.setSelectionRange(position, position);
    });
  };

  const uploadOne = async (file, durationMs = null) => {
    const form = new FormData();
    form.append('file', file);
    if (durationMs) form.append('durationMs', String(Math.round(durationMs)));
    return unwrap(await api.post('/uploads', form, { timeout: 60_000 }));
  };

  const addFiles = async (fileList) => {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    const available = 10 - staged.length;
    if (available <= 0) {
      toast.error('You can attach up to 10 files to a message.');
      return;
    }
    const keep = files.slice(0, available);
    const tooLarge = keep.find((file) => file.size > MAX_FILE_MB * 1024 * 1024);
    if (tooLarge) {
      toast.error(`${tooLarge.name} is larger than ${MAX_FILE_MB} MB.`);
      return;
    }

    setUploading(true);
    try {
      const uploaded = [];
      for (const file of keep) {
        uploaded.push(await uploadOne(file));
      }
      setStaged((current) => [...current, ...uploaded]);
    } catch (error) {
      toast.error(getErrorMessage(error, 'That file could not be uploaded.'));
    } finally {
      setUploading(false);
    }
  };

  const removeStaged = (id) => setStaged((current) => current.filter((item) => item.id !== id));

  const resetComposer = () => {
    clearDraft(chatId);
    setStaged([]);
    onCancelReply?.();
    onCancelEdit?.();
  };

  const submit = async () => {
    if (disabled || !canSend) return;
    const text = value.trim();

    if (editing) {
      if (!text) return;
      setSending(true);
      try {
        await editMessage(editing.id, text);
        clearDraft(chatId);
        onCancelEdit?.();
        onSent?.();
      } catch (error) {
        toast.error(getErrorMessage(error, 'This message could not be edited.'));
      } finally {
        setSending(false);
      }
      return;
    }

    const imagesOnly = staged.length > 0 && staged.every(isImageAttachment);
    const type = staged.length ? (imagesOnly ? 'image' : 'file') : 'text';

    setSending(true);
    try {
      await sendMessage(chatId, {
        body: text,
        type,
        replyToId: replyTo?.id ?? null,
        replyTo: replyTo ?? null,
        attachmentIds: staged.map((item) => item.id),
        attachments: staged,
      });
      resetComposer();
      stopTyping(chatId);
      onSent?.();
      inputRef.current?.focus();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Your message could not be sent.'));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
    if (event.key === 'Escape' && (replyTo || editing)) {
      onCancelReply?.();
      onCancelEdit?.();
    }
  };

  const stopMedia = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const finishRecording = async (send) => {
    const seconds = (Date.now() - startedRef.current) / 1000;
    setRecording(false);
    stopMedia();

    if (!send || discardRef.current) {
      discardRef.current = false;
      setElapsed(0);
      return;
    }

    const chunks = chunksRef.current;
    chunksRef.current = [];
    if (!chunks.length) {
      toast.error('No audio was captured. Try again.');
      setElapsed(0);
      return;
    }

    setVoiceBusy(true);
    setElapsed(0);
    try {
      const mime = chunks[0]?.type || 'audio/webm';
      const extension = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
      const blob = new Blob(chunks, { type: mime });
      const file = new File([blob], `voice-note-${Date.now()}.${extension}`, { type: mime });
      const attachment = await uploadOne(file, seconds * 1000);
      await sendMessage(chatId, {
        body: '',
        type: 'voice',
        replyToId: replyTo?.id ?? null,
        replyTo: replyTo ?? null,
        attachmentIds: [attachment.id],
        attachments: [attachment],
      });
      onCancelReply?.();
      onSent?.();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Your voice note could not be sent.'));
    } finally {
      setVoiceBusy(false);
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Voice notes are not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ].find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      discardRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => finishRecording(!discardRef.current);
      recorder.start();
      startedRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        setElapsed((Date.now() - startedRef.current) / 1000);
      }, 200);
    } catch (error) {
      stopMedia();
      toast.error(
        error?.name === 'NotAllowedError'
          ? 'Microphone access was blocked. Enable it in your browser settings.'
          : 'The microphone could not be started.',
      );
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    } else {
      finishRecording(false);
    }
  };

  const cancelRecording = () => {
    discardRef.current = true;
    setElapsed(0);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    else {
      setRecording(false);
      stopMedia();
    }
  };

  if (readOnlyReason) {
    return (
      <div className={styles.readOnly}>
        <p>{readOnlyReason}</p>
      </div>
    );
  }

  return (
    <div className={styles.composerWrap}>
      {replyTo ? (
        <div className={styles.contextBanner}>
          <span className={styles.contextBar} />
          <div className={styles.contextText}>
            <strong>Replying to {replyTo.sender?.displayName ?? 'message'}</strong>
            <span>{replyTo.body?.slice(0, 140) || 'Attachment'}</span>
          </div>
          <button type="button" onClick={onCancelReply} aria-label="Cancel reply">
            <X size={15} />
          </button>
        </div>
      ) : null}

      {editing ? (
        <div className={styles.contextBanner}>
          <span className={styles.contextBar} />
          <div className={styles.contextText}>
            <strong>
              <Pencil size={12} /> Editing message
            </strong>
            <span>Press Escape to cancel</span>
          </div>
          <button type="button" onClick={onCancelEdit} aria-label="Cancel edit">
            <X size={15} />
          </button>
        </div>
      ) : null}

      {staged.length ? (
        <div className={styles.chips}>
          {staged.map((attachment) => (
            <AttachmentChip key={attachment.id} attachment={attachment} onRemove={removeStaged} />
          ))}
        </div>
      ) : null}

      {recording ? (
        <div className={styles.recording}>
          <span className={styles.liveDot} />
          <strong>Recording</strong>
          <span className={styles.recordingTime}>{formatCallDuration(elapsed)}</span>
          <div className={styles.recordingWave} aria-hidden="true">
            {Array.from({ length: 20 }).map((_, index) => (
              <i key={index} style={{ animationDelay: `${index * 60}ms` }} />
            ))}
          </div>
          <button type="button" className={styles.recordingCancel} onClick={cancelRecording}>
            <Trash2 size={15} /> Discard
          </button>
          <button type="button" className={styles.recordingStop} onClick={stopRecording}>
            <Square size={13} fill="currentColor" /> Send
          </button>
        </div>
      ) : (
        <div className={cn(styles.composer, editing && styles.composerEditing)}>
          <div className={styles.tools}>
            <div className={styles.popoverWrap} ref={attachRef}>
              <button
                type="button"
                className={styles.tool}
                onClick={() => setAttachOpen((open) => !open)}
                aria-label="Add an attachment"
                aria-expanded={attachOpen}
                disabled={uploading || sending}
              >
                {uploading ? <Spinner size={17} /> : <Paperclip size={18} />}
              </button>
              {attachOpen ? (
                <div className={styles.attachMenu}>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachOpen(false);
                      imageRef.current?.click();
                    }}
                  >
                    <ImagePlus size={16} />
                    <span>
                      <strong>Photo</strong>
                      <small>JPG, PNG, WebP, GIF, AVIF</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachOpen(false);
                      fileRef.current?.click();
                    }}
                  >
                    <Paperclip size={16} />
                    <span>
                      <strong>File</strong>
                      <small>PDF, docs, audio, video</small>
                    </span>
                  </button>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className={styles.tool}
              onClick={() => inputRef.current?.focus()}
              aria-label="Write a message"
            >
              <span className={styles.writeGlyph}>Aa</span>
            </button>
          </div>

          <textarea
            ref={inputRef}
            className={styles.input}
            value={value}
            onChange={(event) => change(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              editing
                ? 'Edit your message…'
                : `Message ${chat?.otherUser?.displayName?.split(' ')[0] ?? ''}`
            }
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            disabled={sending || disabled}
            aria-label="Message"
          />

          <div className={styles.actions}>
            <span className={styles.count}>
              {value.length > MAX_MESSAGE_LENGTH - 200
                ? `${MAX_MESSAGE_LENGTH - value.length}`
                : ''}
            </span>
            <div className={styles.popoverWrap} ref={emojiRef}>
              <button
                type="button"
                className={cn(styles.tool, emojiOpen && styles.toolActive)}
                onClick={() => setEmojiOpen((open) => !open)}
                aria-label="Choose an emoji"
                aria-expanded={emojiOpen}
              >
                <Smile size={18} />
              </button>
              {emojiOpen ? (
                <div className={styles.emoji}>
                  <EmojiPicker
                    onEmojiClick={(emoji) => insertEmoji(emoji.emoji)}
                    theme="auto"
                    lazyLoadEmojis
                    searchPlaceHolder="Find an emoji"
                    width={320}
                    height={380}
                  />
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className={styles.tool}
              onClick={startRecording}
              aria-label="Record a voice note"
              disabled={sending || uploading || voiceBusy}
            >
              {voiceBusy ? <Spinner size={17} /> : <Mic size={18} />}
            </button>

            <button
              type="button"
              className={cn(styles.send, canSend && styles.sendReady)}
              onClick={submit}
              disabled={!canSend || disabled}
              aria-label={editing ? 'Save changes' : 'Send message'}
            >
              {sending ? <Spinner size={16} /> : <ArrowUp size={18} strokeWidth={2.4} />}
            </button>
          </div>
        </div>
      )}

      <input
        ref={imageRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        multiple
        hidden
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED}
        multiple
        hidden
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
      />

      <div className={styles.hint}>
        <span>
          <kbd>Enter</kbd> to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line
        </span>
        <span className={styles.identity}>Signed in as @{me?.username}</span>
      </div>
    </div>
  );
}
