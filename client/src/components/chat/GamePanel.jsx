import { useEffect, useRef, useState } from 'react';
import {
  Eraser,
  Pencil,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Trophy,
  Undo2,
  Redo2,
  PaintBucket,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, IconButton } from '../ui/Primitives';
import { useAuthStore } from '../../stores/authStore';
import { useGameStore } from '../../stores/gameStore';
import { cn, getErrorMessage } from '../../lib/utils';
import styles from './GamePanel.module.css';

const COLORS = [
  '#111827',
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#ffffff',
];

function useCountdown(endsAt, active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active || !endsAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active, endsAt]);
  if (!active || !endsAt) return null;
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1000));
}

function TttBoard({ game, meId, onMove, busy }) {
  const state = game.state || {};
  const board = state.board || Array(9).fill(null);
  const myTurn = game.status === 'active' && state.turnUserId === meId;
  const winnerLine = new Set(state.winnerLine || []);
  const myMark = state.marks?.[meId];
  const otherId = game.inviter.id === meId ? game.invitee.id : game.inviter.id;
  const otherMark = state.marks?.[otherId];
  const turnName =
    game.status !== 'active'
      ? null
      : state.turnUserId === meId
        ? 'Your turn'
        : `${state.turnUserId === game.inviter.id ? game.inviter.displayName : game.invitee.displayName}'s turn`;

  return (
    <div className={styles.ttt}>
      <div className={styles.tttMeta}>
        <span className={styles.pill}>You: {myMark || '?'}</span>
        <span className={styles.pill}>Them: {otherMark || '?'}</span>
        {turnName ? (
          <span className={cn(styles.pill, myTurn && styles.pillAccent)}>{turnName}</span>
        ) : null}
      </div>
      <div className={styles.board} role="grid" aria-label="Tic-Tac-Toe board">
        {board.map((cell, index) => {
          const canPlay = myTurn && !cell && !busy;
          return (
            <button
              key={index}
              type="button"
              className={cn(
                styles.cell,
                cell === 'X' && styles.cellX,
                cell === 'O' && styles.cellO,
                winnerLine.has(index) && styles.cellWin,
                canPlay && styles.cellPlayable,
              )}
              onClick={() => canPlay && onMove(index)}
              disabled={!canPlay}
              aria-label={`Square ${index + 1}${cell ? `, ${cell}` : ''}`}
            >
              {cell}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function drawStroke(ctx, stroke, w, h) {
  if (stroke.tool === 'fill') {
    ctx.save();
    ctx.fillStyle = stroke.color || '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    return;
  }
  const pts = stroke.points || [];
  if (!pts.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = (stroke.size || 4) * (w / 640);
  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke.color || '#111827';
  }
  ctx.beginPath();
  ctx.moveTo(pts[0].x * w, pts[0].y * h);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x * w, pts[i].y * h);
  ctx.stroke();
  ctx.restore();
}

function DrawCanvas({ game, meId, onStroke, onAction }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const drawing = useRef(false);
  const points = useRef([]);
  const [tool, setTool] = useState('pencil');
  const [color, setColor] = useState('#111827');
  const [size, setSize] = useState(4);
  const state = game.state || {};
  const isDrawer = state.drawerId === meId;
  const active = game.status === 'active' && state.phase === 'drawing';

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.floor(w * 0.62);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fffdf8';
    ctx.fillRect(0, 0, w, h);
    for (const stroke of state.strokes || []) drawStroke(ctx, stroke, w, h);
  }, [state.strokes, game.id, state.round]);

  const pointFromEvent = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const finishStroke = async () => {
    if (!drawing.current) return;
    drawing.current = false;
    const pts = points.current;
    points.current = [];
    if (pts.length < 2) return;
    try {
      await onStroke({ tool, color, size, points: pts });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not send stroke.'));
    }
  };

  const onPointerDown = (e) => {
    if (!isDrawer || !active) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    points.current = [pointFromEvent(e)];
  };
  const onPointerMove = (e) => {
    if (!drawing.current) return;
    points.current.push(pointFromEvent(e));
    // lightweight local preview
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const w = parseFloat(canvas.style.width);
    const h = parseFloat(canvas.style.height);
    const pts = points.current.slice(-2);
    if (pts.length === 2) drawStroke(ctx, { tool, color, size, points: pts }, w, h);
  };

  return (
    <div className={styles.drawWrap}>
      <div className={styles.drawTools}>
        <div className={styles.toolGroup}>
          <button
            type="button"
            className={cn(styles.toolBtn, tool === 'pencil' && styles.toolActive)}
            onClick={() => setTool('pencil')}
            disabled={!isDrawer}
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            className={cn(styles.toolBtn, tool === 'eraser' && styles.toolActive)}
            onClick={() => setTool('eraser')}
            disabled={!isDrawer}
          >
            <Eraser size={15} />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => onAction('fill', { color })}
            disabled={!isDrawer || !active}
          >
            <PaintBucket size={15} />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => onAction('undo')}
            disabled={!isDrawer || !active}
          >
            <Undo2 size={15} />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => onAction('redo')}
            disabled={!isDrawer || !active}
          >
            <Redo2 size={15} />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => onAction('clear')}
            disabled={!isDrawer || !active}
          >
            <Trash2 size={15} />
          </button>
        </div>
        <div className={styles.toolGroup}>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={cn(styles.colorBtn, color === c && styles.colorActive)}
              style={{ background: c }}
              onClick={() => {
                setColor(c);
                setTool('pencil');
              }}
              disabled={!isDrawer}
              aria-label={`Color ${c}`}
            />
          ))}
          <label className={styles.sizeLabel}>
            <input
              type="range"
              min="2"
              max="28"
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              disabled={!isDrawer}
            />
          </label>
        </div>
      </div>
      <div className={styles.canvasWrap} ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className={cn(styles.canvas, isDrawer && active && styles.canvasActive)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishStroke}
          onPointerLeave={finishStroke}
        />
        {!isDrawer ? <div className={styles.canvasOverlay}>You are guessing</div> : null}
      </div>
    </div>
  );
}

function DrawGuess({ game, meId, onStroke, onAction, onGuess, onAdvance }) {
  const state = game.state || {};
  const [guess, setGuess] = useState('');
  const [busy, setBusy] = useState(false);
  const isDrawer = state.drawerId === meId;
  const isGuesser = state.guesserId === meId;
  const roundActive = game.status === 'active' && ['drawing', 'round_end'].includes(state.phase);
  const secondsLeft = useCountdown(state.roundEndsAt, roundActive);
  const canGuess = game.status === 'active' && isGuesser && state.phase === 'drawing';

  const advancedRef = useRef(null);
  useEffect(() => {
    if (secondsLeft !== 0) return;
    if (game.status !== 'active' || !['drawing', 'round_end'].includes(state.phase)) return;
    const key = `${game.id}:${state.round}:${state.phase}`;
    if (advancedRef.current === key) return;
    advancedRef.current = key;
    onAdvance().catch(() => {
      advancedRef.current = null;
    });
  }, [secondsLeft, game.status, state.phase, state.round, game.id, onAdvance]);

  const submitGuess = async (e) => {
    e.preventDefault();
    if (!guess.trim() || !canGuess) return;
    setBusy(true);
    try {
      await onGuess(guess.trim());
      setGuess('');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Guess could not be sent.'));
    } finally {
      setBusy(false);
    }
  };

  const scores = state.scores || {};
  const inviterScore = scores[game.inviter.id] || 0;
  const inviteeScore = scores[game.invitee.id] || 0;

  return (
    <div className={styles.drawGuess}>
      <div className={styles.drawMeta}>
        <span className={styles.pill}>
          Round {state.round}/{state.totalRounds}
        </span>
        <span className={styles.pill}>
          {state.category} · {state.difficulty}
        </span>
        {secondsLeft !== null ? (
          <span className={cn(styles.pill, secondsLeft <= 10 && styles.pillDanger)}>
            {secondsLeft}s
          </span>
        ) : null}
        <span className={cn(styles.pill, styles.pillAccent)}>
          {state.phase === 'round_end'
            ? `Word: ${state.word || state.lastWord || state.wordHint}`
            : isDrawer
              ? `Draw: ${state.word || state.wordHint}`
              : `Hint: ${state.wordHint || '...'}`}
        </span>
      </div>
      <div className={styles.scoreRow}>
        <span>
          {game.inviter.displayName}: <strong>{inviterScore}</strong>
        </span>
        <span>
          {game.invitee.displayName}: <strong>{inviteeScore}</strong>
        </span>
      </div>
      <DrawCanvas game={game} meId={meId} onStroke={onStroke} onAction={onAction} />
      {state.phase === 'round_end' ? (
        <div className={styles.roundReveal} aria-live="polite">
          {state.roundWinnerId
            ? state.roundWinnerId === meId
              ? 'You got it!'
              : `${state.roundWinnerId === game.inviter.id ? game.inviter.displayName : game.invitee.displayName} got it!`
            : "Time's up!"}{' '}
          The word was <strong>{state.word || state.lastWord}</strong>.
        </div>
      ) : null}
      <div className={styles.guesses}>
        {(state.guesses || []).slice(-6).map((g) => (
          <div key={g.id} className={cn(styles.guess, g.correct && styles.guessCorrect)}>
            <strong>{g.userId === meId ? 'You' : 'Them'}:</strong> {g.text} {g.correct ? '✓' : ''}
          </div>
        ))}
      </div>
      {canGuess ? (
        <form className={styles.guessForm} onSubmit={submitGuess}>
          <input
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="Type your guess..."
            maxLength={80}
          />
          <Button type="submit" size="sm" icon={Send} loading={busy} disabled={!guess.trim()}>
            Guess
          </Button>
        </form>
      ) : isDrawer && state.phase === 'drawing' ? (
        <p className={styles.hint}>You are drawing. The other player is guessing.</p>
      ) : null}
    </div>
  );
}

export function GamePanel({ game, onClose }) {
  const me = useAuthStore((s) => s.user);
  const { accept, decline, move, stroke, drawAction, guess, advanceRound, playAgain } =
    useGameStore();
  const [busy, setBusy] = useState(false);
  const meId = me?.id;
  if (!game) return null;

  const isInvitee = game.invitee?.id === meId;
  const title = game.type === 'drawguess' ? 'Draw & Guess' : 'Tic-Tac-Toe';

  const run = async (fn, fallback) => {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      toast.error(getErrorMessage(error, fallback));
    } finally {
      setBusy(false);
    }
  };

  const winnerName =
    game.winnerId === meId
      ? 'You won!'
      : game.winnerId
        ? `${game.winner?.displayName || 'Opponent'} won`
        : game.result === 'draw'
          ? 'It’s a draw'
          : null;

  return (
    <section className={styles.panel} aria-label={`${title} game`}>
      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <div className={styles.titleRow}>
            <Sparkles size={16} className={styles.spark} />
            <h3>{title}</h3>
            <span className={cn(styles.status, styles[`status_${game.status}`])}>
              {game.status}
            </span>
          </div>
          <p className={styles.subtitle}>
            {game.inviter?.displayName} vs {game.invitee?.displayName}
          </p>
        </div>
        <IconButton label="Close game" size="sm" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </header>

      {game.status === 'invited' ? (
        <div className={styles.inviteBox}>
          <p>
            {isInvitee
              ? `${game.inviter?.displayName} invited you to play.`
              : `Waiting for ${game.invitee?.displayName} to accept...`}
          </p>
          {isInvitee ? (
            <div className={styles.actions}>
              <Button
                size="sm"
                onClick={() => run(() => accept(game.id), 'Could not accept invite')}
                loading={busy}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => run(() => decline(game.id), 'Could not decline invite')}
                disabled={busy}
              >
                Decline
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {game.status === 'active' && game.type === 'tictactoe' ? (
        <TttBoard
          game={game}
          meId={meId}
          busy={busy}
          onMove={(index) => run(() => move(game.id, index), 'Move failed')}
        />
      ) : null}

      {game.status === 'active' && game.type === 'drawguess' ? (
        <DrawGuess
          game={game}
          meId={meId}
          onStroke={(s) => stroke(game.id, s)}
          onAction={(a, p) => run(() => drawAction(game.id, a, p), 'Action failed')}
          onGuess={(g) => guess(game.id, g)}
          onAdvance={() => advanceRound(game.id)}
        />
      ) : null}

      {['completed', 'declined', 'cancelled', 'expired'].includes(game.status) ? (
        <div className={styles.resultBox}>
          {winnerName ? (
            <div className={styles.winner}>
              <Trophy size={18} /> <span>{winnerName}</span>
            </div>
          ) : (
            <p>Game {game.status}.</p>
          )}
          {game.type === 'drawguess' && game.state?.scores ? (
            <div className={styles.scoreRow}>
              <span>
                {game.inviter.displayName}:{' '}
                <strong>{game.state.scores[game.inviter.id] || 0}</strong>
              </span>
              <span>
                {game.invitee.displayName}:{' '}
                <strong>{game.state.scores[game.invitee.id] || 0}</strong>
              </span>
            </div>
          ) : null}
          <div className={styles.actions}>
            <Button
              size="sm"
              icon={RotateCcw}
              onClick={() => run(() => playAgain(game.id), 'Could not start a new game')}
              loading={busy}
            >
              Play again
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
