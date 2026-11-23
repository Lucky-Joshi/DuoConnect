import crypto from 'node:crypto';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { withTransaction, query } from '../../db/index.js';
import { emitToUsers } from '../../realtime/events.js';
import * as chatsRepo from '../chats/chats.repository.js';
import * as messagesRepo from '../messages/messages.repository.js';
import * as messagesService from '../messages/messages.service.js';
import { notify } from '../notifications/notifications.service.js';
import * as repo from './games.repository.js';

const TTT_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const WORDS = {
  animals: {
    easy: ['cat', 'dog', 'fish', 'bird', 'lion'],
    medium: ['giraffe', 'penguin', 'dolphin', 'kangaroo', 'elephant'],
    hard: ['chameleon', 'platypus', 'armadillo', 'porcupine', 'salamander'],
  },
  movies: {
    easy: ['titanic', 'frozen', 'avatar', 'shrek', 'jaws'],
    medium: ['inception', 'gladiator', 'coco', 'rocky', 'aladdin'],
    hard: ['interstellar', 'whiplash', 'casablanca', 'parasite', 'amelie'],
  },
  technology: {
    easy: ['phone', 'laptop', 'robot', 'mouse', 'camera'],
    medium: ['keyboard', 'internet', 'database', 'browser', 'battery'],
    hard: ['algorithm', 'encryption', 'microchip', 'blockchain', 'bandwidth'],
  },
  sports: {
    easy: ['soccer', 'tennis', 'golf', 'boxing', 'skiing'],
    medium: ['baseball', 'cricket', 'cycling', 'surfing', 'archery'],
    hard: ['triathlon', 'fencing', 'badminton', 'snowboard', 'gymnastics'],
  },
  food: {
    easy: ['pizza', 'apple', 'bread', 'cake', 'taco'],
    medium: ['pancake', 'noodles', 'burrito', 'omelette', 'lasagna'],
    hard: ['croissant', 'bruschetta', 'ratatouille', 'gnocchi', 'tiramisu'],
  },
  places: {
    easy: ['beach', 'school', 'park', 'desert', 'forest'],
    medium: ['airport', 'museum', 'volcano', 'library', 'stadium'],
    hard: ['cathedral', 'lighthouse', 'observatory', 'marketplace', 'amphitheater'],
  },
};

const CATEGORIES = Object.keys(WORDS);
const DIFFICULTIES = ['easy', 'medium', 'hard'];

function nowIso() {
  return new Date().toISOString();
}

function pickWord(category = 'random', difficulty = 'easy', used = []) {
  const cat =
    category === 'random' ? CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)] : category;
  const pool = (WORDS[cat]?.[difficulty] ?? WORDS.animals.easy).filter((w) => !used.includes(w));
  const source = pool.length ? pool : (WORDS[cat]?.[difficulty] ?? WORDS.animals.easy);
  const word = source[Math.floor(Math.random() * source.length)];
  return { word, category: cat, difficulty };
}

function mapPlayer(row, prefix) {
  return {
    id: row[`${prefix}_id`],
    username: row[`${prefix}_username`],
    displayName: row[`${prefix}_display_name`],
    avatarUrl: row[`${prefix}_avatar_url`],
  };
}

function publicState(game, viewerId) {
  const state = game.state ?? {};
  if (game.type !== 'drawguess') return state;
  const hiddenWord =
    game.status === 'active' && state.phase === 'drawing' && viewerId !== state.drawerId;
  return {
    ...state,
    word: hiddenWord ? undefined : state.word,
    wordHint: hiddenWord ? state.wordHint : state.word,
    hiddenWord,
  };
}

export function mapGame(row, viewerId = null) {
  const game = {
    id: row.id,
    chatId: row.chat_id,
    type: row.type,
    status: row.status,
    result: row.result,
    winnerId: row.winner_id,
    inviteMessageId: row.invite_message_id,
    inviter: mapPlayer(row, 'inviter'),
    invitee: mapPlayer(row, 'invitee'),
    winner: row.winner_id ? mapPlayer(row, 'winner') : null,
    state: publicState(row, viewerId),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
  game.players = [game.inviter, game.invitee];
  return game;
}

function summaryFor(game) {
  const label = game.type === 'drawguess' ? 'Draw & Guess' : 'Tic-Tac-Toe';
  if (game.status === 'invited') return `${label} invitation`;
  if (game.status === 'active') return `${label} in progress`;
  if (game.result === 'draw') return `${label} ended in a draw`;
  if (game.winnerId)
    return `${label}: ${game.winner_id === game.inviter_id ? game.inviter_display_name : game.invitee_display_name} won`;
  if (game.status === 'declined') return `${label} invitation declined`;
  return `${label} game`;
}

async function emitGame(gameRow) {
  const viewers = [gameRow.inviter_id, gameRow.invitee_id];
  for (const viewerId of viewers) {
    emitToUsers([viewerId], 'game:updated', mapGame(gameRow, viewerId));
  }
}

async function getGameOrThrow(gameId) {
  const game = await repo.getGameById(gameId);
  if (!game) throw notFound('Game not found.');
  return game;
}

function assertParticipant(game, userId) {
  if (game.inviter_id !== userId && game.invitee_id !== userId) {
    throw forbidden('You are not part of this game.');
  }
}

async function assertChatPlayers(chatId, userId, peerId) {
  const access = await chatsRepo.getAccessState(chatId, userId);
  if (!access) throw notFound('Conversation not found.');
  if (access.chat.kind !== 'direct')
    throw badRequest('Games are available in direct chats for now.');
  if (access.peer?.id !== peerId) throw badRequest('Choose a valid player for this game.');
  if (!access.canMessage) throw forbidden('This conversation is read-only.');
  return access;
}

function createTttState(inviterId, inviteeId) {
  const inviterMark = Math.random() > 0.5 ? 'X' : 'O';
  const inviteeMark = inviterMark === 'X' ? 'O' : 'X';
  const marks = { [inviterId]: inviterMark, [inviteeId]: inviteeMark };
  const turnUserId = inviterMark === 'X' ? inviterId : inviteeId;
  return {
    board: Array(9).fill(null),
    marks,
    turnUserId,
    winnerLine: null,
    winnerUserId: null,
    draw: false,
    moves: 0,
  };
}

function createDrawState(inviterId, inviteeId, options = {}) {
  const category = CATEGORIES.includes(options.category) ? options.category : 'random';
  const difficulty = DIFFICULTIES.includes(options.difficulty) ? options.difficulty : 'easy';
  const totalRounds = Math.min(5, Math.max(1, Number(options.rounds || 3)));
  const drawerId = inviterId;
  const guesserId = inviteeId;
  const { word, category: resolvedCategory } = pickWord(category, difficulty, []);
  return {
    round: 1,
    totalRounds,
    category: resolvedCategory,
    requestedCategory: category,
    difficulty,
    drawerId,
    guesserId,
    word,
    wordHint: word.replace(/[a-zA-Z0-9]/g, '_'),
    strokes: [],
    redo: [],
    guesses: [],
    scores: { [inviterId]: 0, [inviteeId]: 0 },
    phase: 'drawing',
    roundEndsAt: new Date(Date.now() + 75_000).toISOString(),
    roundWinnerId: null,
    usedWords: [word],
  };
}

async function createGameMessage(client, { chatId, senderId, gameRow }) {
  const game = mapGame(gameRow, senderId);
  const { rows } = await client.query(
    `INSERT INTO messages (chat_id, sender_id, type, body, metadata)
     VALUES ($1,$2,'game',$3,$4::jsonb)
     RETURNING id`,
    [
      chatId,
      senderId,
      game.type === 'drawguess' ? 'Draw & Guess' : 'Tic-Tac-Toe',
      JSON.stringify({
        gameId: game.id,
        gameType: game.type,
        status: game.status,
        result: game.result,
        winnerId: game.winnerId,
        summary: summaryFor(gameRow),
        inviterId: game.inviter.id,
        inviteeId: game.invitee.id,
      }),
    ],
  );
  const messageId = rows[0].id;
  await messagesRepo.insertReceipts(client, messageId, chatId, senderId);
  await client.query('UPDATE chats SET last_message_at = now(), updated_at = now() WHERE id = $1', [
    chatId,
  ]);
  return messageId;
}

async function updateGameMessage(gameRow) {
  if (!gameRow.invite_message_id) return;
  const summary = summaryFor(gameRow);
  await query(
    `UPDATE messages
        SET body = $2,
            metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
      WHERE id = $1`,
    [
      gameRow.invite_message_id,
      gameRow.type === 'drawguess' ? 'Draw & Guess' : 'Tic-Tac-Toe',
      JSON.stringify({
        gameId: gameRow.id,
        gameType: gameRow.type,
        status: gameRow.status,
        result: gameRow.result,
        winnerId: gameRow.winner_id,
        summary,
      }),
    ],
  );
  const message = await messagesService.getMessageById(gameRow.invite_message_id);
  if (message)
    emitToUsers(await chatsRepo.getMemberIds(gameRow.chat_id), 'message:updated', message);
}

export async function createInvite(userId, input) {
  const chatId = input.chatId;
  const chat = await chatsRepo.getChatById(chatId);
  if (!chat) throw notFound('Conversation not found.');
  const membership = await chatsRepo.getMembership(chatId, userId);
  if (!membership) throw forbidden('You are not part of this conversation.');

  const memberIds = await chatsRepo.getMemberIds(chatId);
  const peerId = memberIds.find((id) => id !== userId);
  if (!peerId) throw badRequest('No player available for this game.');
  await assertChatPlayers(chatId, userId, peerId);

  const active = await repo.getActiveForChat(chatId);
  if (active) throw badRequest('There is already an active game in this chat. Finish it first.');

  const state =
    input.type === 'tictactoe'
      ? createTttState(userId, peerId)
      : createDrawState(userId, peerId, input);

  let created;
  try {
    created = await withTransaction(async (tx) => {
      const gameId = await repo.createGame(tx, {
        chatId,
        type: input.type,
        status: 'invited',
        inviterId: userId,
        inviteeId: peerId,
        state,
      });
      const gameRow = await repo.getGameByIdForUpdate(tx, gameId);
      const messageId = await createGameMessage(tx, { chatId, senderId: userId, gameRow });
      await repo.attachInviteMessage(tx, gameId, messageId);
      await repo.insertEvent(tx, { gameId, userId, type: 'invite', payload: { type: input.type } });
      return repo.getGameByIdForUpdate(tx, gameId);
    });
  } catch (error) {
    if (error?.code === '23505') {
      throw badRequest('There is already an active game in this chat. Finish it first.');
    }
    throw error;
  }

  const message = await messagesService.getMessageById(created.invite_message_id);
  if (message) emitToUsers(memberIds, 'message:new', { ...message, clientId: null });
  await emitGame(created);

  await notify({
    userId: created.invitee_id,
    actorId: userId,
    type: 'game_invite',
    chatId,
    payload: {
      title: 'Game invitation',
      body: `${created.inviter_display_name} invited you to play ${created.type === 'drawguess' ? 'Draw & Guess' : 'Tic-Tac-Toe'}.`,
      gameId: created.id,
    },
  });

  return mapGame(created, userId);
}

export async function getGame(gameId, userId) {
  const game = await getGameOrThrow(gameId);
  assertParticipant(game, userId);
  return mapGame(game, userId);
}

export async function getActive(chatId, userId) {
  await chatsRepo.getMembership(chatId, userId).then((m) => {
    if (!m) throw forbidden('You are not part of this conversation.');
  });
  const game = await repo.getActiveForChat(chatId);
  return game ? mapGame(game, userId) : null;
}

export async function acceptInvite(gameId, userId) {
  await withTransaction(async (tx) => {
    const game = await repo.getGameByIdForUpdate(tx, gameId);
    if (!game) throw notFound('Game not found.');
    assertParticipant(game, userId);
    if (game.invitee_id !== userId) throw forbidden('Only the invited player can accept.');
    if (game.status !== 'invited') throw badRequest('This invitation is no longer active.');
    const row = await repo.updateGame(tx, gameId, { status: 'active', startedAt: new Date() });
    await repo.insertEvent(tx, { gameId, userId, type: 'accept', payload: {} });
    return { ...game, ...row, status: 'active', started_at: row.started_at ?? game.started_at };
  });
  const finalRow = await repo.getGameById(gameId);
  await updateGameMessage(finalRow);
  await emitGame(finalRow);
  return mapGame(finalRow, userId);
}

export async function declineInvite(gameId, userId) {
  const finalRow = await withTransaction(async (tx) => {
    const game = await repo.getGameByIdForUpdate(tx, gameId);
    if (!game) throw notFound('Game not found.');
    assertParticipant(game, userId);
    if (game.invitee_id !== userId) throw forbidden('Only the invited player can decline.');
    if (game.status !== 'invited') throw badRequest('This invitation is no longer active.');
    await repo.updateGame(tx, gameId, {
      status: 'declined',
      result: 'declined',
      endedAt: new Date(),
    });
    await repo.insertEvent(tx, { gameId, userId, type: 'decline', payload: {} });
    return repo.getGameByIdForUpdate(tx, gameId);
  });
  await updateGameMessage(finalRow);
  await emitGame(finalRow);
  return mapGame(finalRow, userId);
}

function evaluateTtt(board) {
  for (const line of TTT_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { winnerLine: line };
  }
  if (board.every(Boolean)) return { draw: true };
  return null;
}

export async function makeTttMove(gameId, userId, index) {
  const finalRow = await withTransaction(async (tx) => {
    const game = await repo.getGameByIdForUpdate(tx, gameId);
    if (!game) throw notFound('Game not found.');
    assertParticipant(game, userId);
    if (game.type !== 'tictactoe') throw badRequest('Invalid game type.');
    if (game.status !== 'active') throw badRequest('This game is not active.');
    const state = { ...game.state };
    if (state.turnUserId !== userId) throw badRequest('It is not your turn.');
    if (state.board[index]) throw badRequest('That square is already taken.');
    state.board = [...state.board];
    state.board[index] = state.marks[userId];
    state.moves = (state.moves || 0) + 1;
    state.lastMoveAt = nowIso();

    const outcome = evaluateTtt(state.board);
    let patch = { state };
    if (outcome?.winnerLine) {
      state.winnerLine = outcome.winnerLine;
      state.winnerUserId = userId;
      patch = { state, status: 'completed', winnerId: userId, result: 'win', endedAt: new Date() };
    } else if (outcome?.draw) {
      state.draw = true;
      patch = { state, status: 'completed', winnerId: null, result: 'draw', endedAt: new Date() };
    } else {
      state.turnUserId = game.inviter_id === userId ? game.invitee_id : game.inviter_id;
      patch = { state };
    }

    await repo.updateGame(tx, gameId, patch);
    await repo.insertEvent(tx, { gameId, userId, type: 'ttt_move', payload: { index } });
    return repo.getGameByIdForUpdate(tx, gameId);
  });
  await updateGameMessage(finalRow);
  await emitGame(finalRow);
  return mapGame(finalRow, userId);
}

function ensureRoundActive(state) {
  if (state.phase !== 'drawing') throw badRequest('This round is not accepting that action.');
  if (new Date(state.roundEndsAt).getTime() < Date.now()) throw badRequest('Round time is up.');
}

export async function appendStroke(gameId, userId, stroke) {
  const finalRow = await withTransaction(async (tx) => {
    const game = await repo.getGameByIdForUpdate(tx, gameId);
    if (!game) throw notFound('Game not found.');
    assertParticipant(game, userId);
    if (game.type !== 'drawguess' || game.status !== 'active')
      throw badRequest('Game is not active.');
    const state = { ...game.state, strokes: [...(game.state.strokes || [])], redo: [] };
    if (state.drawerId !== userId) throw forbidden('Only the drawer can draw.');
    ensureRoundActive(state);
    state.strokes.push({
      ...stroke,
      id: crypto.randomUUID(),
      at: Date.now(),
    });
    if (state.strokes.length > 2000) state.strokes = state.strokes.slice(-2000);
    await repo.updateGame(tx, gameId, { state });
    return repo.getGameByIdForUpdate(tx, gameId);
  });
  await emitGame(finalRow);
  return mapGame(finalRow, userId);
}

export async function drawAction(gameId, userId, action, payload = {}) {
  const finalRow = await withTransaction(async (tx) => {
    const game = await repo.getGameByIdForUpdate(tx, gameId);
    if (!game) throw notFound('Game not found.');
    assertParticipant(game, userId);
    if (game.type !== 'drawguess' || game.status !== 'active')
      throw badRequest('Game is not active.');
    const state = {
      ...game.state,
      strokes: [...(game.state.strokes || [])],
      redo: [...(game.state.redo || [])],
    };
    if (state.drawerId !== userId) throw forbidden('Only the drawer can modify the canvas.');
    ensureRoundActive(state);
    if (action === 'clear') {
      state.redo = state.strokes;
      state.strokes = [];
    } else if (action === 'undo') {
      const stroke = state.strokes.pop();
      if (stroke) state.redo.push(stroke);
    } else if (action === 'redo') {
      const stroke = state.redo.pop();
      if (stroke) state.strokes.push(stroke);
    } else if (action === 'fill') {
      state.redo = [];
      state.strokes.push({
        id: crypto.randomUUID(),
        tool: 'fill',
        color: payload.color || '#ffffff',
        at: Date.now(),
      });
    }
    await repo.updateGame(tx, gameId, { state });
    return repo.getGameByIdForUpdate(tx, gameId);
  });
  await emitGame(finalRow);
  return mapGame(finalRow, userId);
}

function finishDrawGuess(state, game) {
  const [a, b] = [game.inviter_id, game.invitee_id];
  const aScore = state.scores[a] || 0;
  const bScore = state.scores[b] || 0;
  if (aScore === bScore) return { status: 'completed', result: 'draw', winnerId: null };
  const winnerId = aScore > bScore ? a : b;
  return { status: 'completed', result: 'win', winnerId };
}

function nextDrawRound(state, game) {
  const nextRound = state.round + 1;
  if (nextRound > state.totalRounds) {
    const end = finishDrawGuess(state, game);
    state.phase = 'finished';
    state.roundEndsAt = null;
    return { ...end, state, endedAt: new Date() };
  }
  const nextDrawer = state.drawerId === game.inviter_id ? game.invitee_id : game.inviter_id;
  const nextGuesser = nextDrawer === game.inviter_id ? game.invitee_id : game.inviter_id;
  const picked = pickWord(
    state.requestedCategory || 'random',
    state.difficulty || 'easy',
    state.usedWords || [],
  );
  return {
    state: {
      ...state,
      round: nextRound,
      drawerId: nextDrawer,
      guesserId: nextGuesser,
      word: picked.word,
      category: picked.category,
      wordHint: picked.word.replace(/[a-zA-Z0-9]/g, '_'),
      strokes: [],
      redo: [],
      guesses: [],
      phase: 'drawing',
      roundEndsAt: new Date(Date.now() + 75_000).toISOString(),
      roundWinnerId: null,
      usedWords: [...(state.usedWords || []), picked.word],
    },
  };
}

export async function submitGuess(gameId, userId, guess) {
  const cleanGuess = guess.trim().toLowerCase();
  const finalRow = await withTransaction(async (tx) => {
    const game = await repo.getGameByIdForUpdate(tx, gameId);
    if (!game) throw notFound('Game not found.');
    assertParticipant(game, userId);
    if (game.type !== 'drawguess' || game.status !== 'active')
      throw badRequest('Game is not active.');
    const state = {
      ...game.state,
      guesses: [...(game.state.guesses || [])],
      scores: { ...(game.state.scores || {}) },
    };
    if (state.guesserId !== userId) throw forbidden('Only the guesser can guess.');
    ensureRoundActive(state);

    const correct = cleanGuess === String(state.word).toLowerCase();
    state.guesses.push({
      id: crypto.randomUUID(),
      userId,
      text: guess.trim().slice(0, 80),
      correct,
      at: nowIso(),
    });
    if (state.guesses.length > 50) state.guesses = state.guesses.slice(-50);

    let patch = { state };
    if (correct) {
      state.scores[userId] = (state.scores[userId] || 0) + 1;
      state.phase = 'round_end';
      state.roundWinnerId = userId;
      state.lastWord = state.word;
      state.roundEndsAt = new Date(Date.now() + 2500).toISOString();
    }

    await repo.updateGame(tx, gameId, patch);
    await repo.insertEvent(tx, { gameId, userId, type: 'guess', payload: { correct } });
    return repo.getGameByIdForUpdate(tx, gameId);
  });
  await updateGameMessage(finalRow);
  await emitGame(finalRow);
  return mapGame(finalRow, userId);
}

export async function advanceDrawRound(gameId, userId) {
  const finalRow = await withTransaction(async (tx) => {
    const game = await repo.getGameByIdForUpdate(tx, gameId);
    if (!game) throw notFound('Game not found.');
    assertParticipant(game, userId);
    if (game.type !== 'drawguess' || game.status !== 'active')
      return repo.getGameByIdForUpdate(tx, gameId);

    const state = {
      ...game.state,
      scores: { ...(game.state.scores || {}) },
      guesses: [...(game.state.guesses || [])],
      strokes: [...(game.state.strokes || [])],
      redo: [...(game.state.redo || [])],
      usedWords: [...(game.state.usedWords || [])],
    };

    if (!['drawing', 'round_end'].includes(state.phase))
      return repo.getGameByIdForUpdate(tx, gameId);
    if (state.roundEndsAt && new Date(state.roundEndsAt).getTime() > Date.now()) {
      return repo.getGameByIdForUpdate(tx, gameId);
    }

    if (state.phase === 'drawing') {
      state.phase = 'round_end';
      state.roundWinnerId = null;
      state.lastWord = state.word;
    }

    const patch = nextDrawRound(state, game);
    await repo.updateGame(tx, gameId, patch);
    await repo.insertEvent(tx, {
      gameId,
      userId,
      type: state.roundWinnerId ? 'round_advance' : 'round_timeout',
      payload: { round: state.round },
    });
    return repo.getGameByIdForUpdate(tx, gameId);
  });
  await updateGameMessage(finalRow);
  await emitGame(finalRow);
  return mapGame(finalRow, userId);
}

export async function playAgain(gameId, userId) {
  const old = await getGameOrThrow(gameId);
  assertParticipant(old, userId);
  if (!['completed', 'declined', 'cancelled', 'expired'].includes(old.status)) {
    throw badRequest('Finish the current game before starting another.');
  }
  return createInvite(userId, {
    chatId: old.chat_id,
    type: old.type,
    rounds: old.state?.totalRounds,
    category: old.state?.requestedCategory || old.state?.category,
    difficulty: old.state?.difficulty,
  });
}

export async function listHistory(chatId, userId, limit = 20) {
  const membership = await chatsRepo.getMembership(chatId, userId);
  if (!membership) throw forbidden('You are not part of this conversation.');
  const rows = await repo.getLatestForChat(chatId, Math.min(50, Math.max(1, limit)));
  return rows.map((row) => mapGame(row, userId));
}

export async function getStats(chatId, userId) {
  const membership = await chatsRepo.getMembership(chatId, userId);
  if (!membership) throw forbidden('You are not part of this conversation.');
  const members = await chatsRepo.getMemberIds(chatId);
  const peerId = members.find((id) => id !== userId);
  if (!peerId) return [];
  const rows = await repo.getStats(userId, peerId);
  return rows;
}
