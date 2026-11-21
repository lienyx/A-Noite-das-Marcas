import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  ROLES,
  SECRET_MISSIONS,
  generateClassicDeck,
  generateCategoriesDeck,
  shuffleArray,
  type DeckMode,
  type Faction,
  type GamePhase,
  type KillerPace,
  type RoleId,
  type SlipType,
  type StickerType,
} from './src/shared/gameData.ts';
import type {
  ChatMessage,
  ClientActionMessage,
  DeathCause,
  DuelState,
  PrivatePlayerState,
  PublicGameState,
  PublicPlayer,
  RoomSyncPayload,
  ServerMessage,
} from './src/shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ServerStickerRecord {
  sticker: StickerType;
  placedBy: string;
  roundPlaced: number;
}

interface ServerPlayer {
  id: string;
  token: string;
  name: string;
  seatIndex: number;
  connected: boolean;
  isHost: boolean;
  alive: boolean;
  deathCause: DeathCause | null;
  revealedPublicly: boolean;
  roleId: RoleId | null;
  originalRoleId: RoleId | null;
  stickers: Partial<Record<StickerType, number>>;
  slips: Partial<Record<SlipType, number>>;
  backMarks: ServerStickerRecord[];
  secretMission: string | null;
  secretMissionDone: boolean;
  blockedThisRound: boolean;
  jailedThisRound: boolean;
  usedRoundAction: boolean;
  usedOrangeThisRound: boolean;
  usedOncePerGame: boolean;
  silenced: boolean;
  readyForNext: boolean;
  individualWin: boolean;
  linkedTargetId: string | null;
  pirateWins: number;
  usedGhostWhisper: boolean;
  secretNotes: Array<{ id: string; round: number; text: string }>;
  mediumRevealedIdentity: boolean;
  urnSubmitted: boolean;
  urnQueuedSlip: SlipType | 'blank' | null;
  urnQueuedTargetId: string | null;
  vestActivated: boolean;
  ws: WebSocket | null;
}

interface RoomState {
  roomCode: string;
  phase: GamePhase;
  round: number;
  phaseEndsAt: number | null;
  phaseTimer: ReturnType<typeof setTimeout> | null;
  deckMode: DeckMode;
  customDeck: RoleId[];
  publicRoleList: RoleId[];
  cacadaMinutes: number;
  tribunalMinutes: number;
  killerPace: KillerPace;
  hideBackMarksUntilBell: boolean;
  players: ServerPlayer[];
  mafiaSealUsedThisRound: number;
  jailedPlayerId: string | null;
  jailorPlayerId: string | null;
  pendingReviveTargetId: string | null;
  pendingReviveCasterId: string | null;
  marshalDoubleElimination: boolean;
  votes: Record<string, string | 'SKIP'>;
  pendingJesterId: string | null;
  pendingJesterVoterIds: string[];
  activeDuel: DuelState | null;
  tribunalChat: ChatMessage[];
  mafiaChat: ChatMessage[];
  mediumChat: ChatMessage[];
  ghostChat: ChatMessage[];
  dungeonChat: ChatMessage[];
  chronicle: Array<{ id: string; round: number; text: string; kind: 'info' | 'death' | 'reveal' | 'win' }>;
  lastBellAnnouncements: string[];
  winningFactions: Faction[];
  winnerPlayerIds: string[];
  winHeadline: string | null;
}

const rooms = new Map<string, RoomState>();

function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function getMafiaSealLimit(room: RoomState): number {
  if (room.killerPace === 'fast') return 2;
  if (room.killerPace === 'slow') return room.round % 2 === 1 ? 1 : 0;
  return 1;
}

function getSerialKillerLimit(room: RoomState): number {
  if (room.killerPace === 'slow') return room.round % 2 === 1 ? 1 : 0;
  return 1;
}

function addChronicle(
  room: RoomState,
  text: string,
  kind: 'info' | 'death' | 'reveal' | 'win' = 'info'
): void {
  room.chronicle.unshift({
    id: uid('chr'),
    round: room.round,
    text,
    kind,
  });
  if (room.chronicle.length > 60) {
    room.chronicle.length = 60;
  }
}

function addPrivateNote(player: ServerPlayer, round: number, text: string): void {
  player.secretNotes.unshift({
    id: uid('note'),
    round,
    text,
  });
}

function clearPhaseTimer(room: RoomState): void {
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
  room.phaseEndsAt = null;
}

function sendToWs(ws: WebSocket | null, msg: ServerMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastSound(
  room: RoomState,
  reason: 'badalada' | 'noite_zero' | 'tribunal' | 'duel' | 'victory'
): void {
  for (const p of room.players) {
    sendToWs(p.ws, { type: 'BELL_SOUND', reason });
  }
}

function buildPublicStateForViewer(room: RoomState, viewer: ServerPlayer): PublicGameState {
  const sorted = [...room.players].sort((a, b) => a.seatIndex - b.seatIndex);
  const publicPlayers: PublicPlayer[] = sorted.map((p) => {
    const isSelf = p.id === viewer.id;
    const canSeeBack =
      !isSelf &&
      (!room.hideBackMarksUntilBell ||
        room.phase === 'DANCA_DOS_SELOS' ||
        room.phase === 'TRIBUNAL' ||
        room.phase === 'FIM_DE_JOGO');

    const shouldRevealRole =
      room.phase === 'FIM_DE_JOGO' || p.revealedPublicly;

    return {
      id: p.id,
      name: p.name,
      seatIndex: p.seatIndex,
      connected: p.connected,
      isHost: p.isHost,
      alive: p.alive,
      deathCause: p.deathCause,
      revealedRole: shouldRevealRole ? p.roleId : null,
      revealedFaction:
        shouldRevealRole && p.roleId ? ROLES[p.roleId].faction : null,
      backMarks: canSeeBack ? p.backMarks.map((m) => m.sticker) : [],
      silenced: p.silenced,
      readyForNext: p.readyForNext,
      individualWin: p.individualWin,
      voteWeight:
        p.revealedPublicly && p.roleId === 'prefeito' ? 3 : 1,
    };
  });

  return {
    roomCode: room.roomCode,
    phase: room.phase,
    round: room.round,
    phaseEndsAt: room.phaseEndsAt,
    deckMode: room.deckMode,
    publicRoleList: room.publicRoleList,
    cacadaMinutes: room.cacadaMinutes,
    tribunalMinutes: room.tribunalMinutes,
    killerPace: room.killerPace,
    hideBackMarksUntilBell: room.hideBackMarksUntilBell,
    players: publicPlayers,
    marshalDoubleElimination: room.marshalDoubleElimination,
    votes: room.votes,
    pendingJesterId: room.pendingJesterId,
    pendingJesterVoterIds: room.pendingJesterVoterIds,
    activeDuel: room.activeDuel,
    jailedPlayerId:
      room.jailedPlayerId === viewer.id || room.jailorPlayerId === viewer.id
        ? room.jailedPlayerId
        : null,
    chronicle: room.chronicle,
    lastBellAnnouncements: room.lastBellAnnouncements,
    winningFactions: room.winningFactions,
    winnerPlayerIds: room.winnerPlayerIds,
    winHeadline: room.winHeadline,
  };
}

function buildPrivateStateForViewer(room: RoomState, viewer: ServerPlayer): PrivatePlayerState {
  const isMafia = viewer.roleId ? ROLES[viewer.roleId].faction === 'MAFIA' : false;
  const mafiaPartners = isMafia
    ? room.players
        .filter((p) => p.roleId && ROLES[p.roleId].faction === 'MAFIA')
        .map((p) => ({
          id: p.id,
          name: p.name,
          roleId: p.roleId as RoleId,
          alive: p.alive,
        }))
    : [];

  const linkedPlayer = viewer.linkedTargetId
    ? room.players.find((p) => p.id === viewer.linkedTargetId) || null
    : null;

  const canSeeMedium = viewer.roleId === 'medium' || !viewer.alive;
  const canSeeGhosts = !viewer.alive;
  const canSeeDungeon =
    room.jailedPlayerId === viewer.id || room.jailorPlayerId === viewer.id;

  return {
    playerId: viewer.id,
    roleId: viewer.roleId,
    originalRoleId: viewer.originalRoleId,
    stickers: viewer.stickers,
    slips: viewer.slips,
    secretMission: viewer.secretMission,
    secretMissionDone: viewer.secretMissionDone,
    blockedThisRound: viewer.blockedThisRound,
    jailedThisRound: viewer.jailedThisRound,
    usedRoundAction: viewer.usedRoundAction,
    usedOncePerGame: viewer.usedOncePerGame,
    mafiaPartners,
    mafiaSealUsedThisRound: room.mafiaSealUsedThisRound,
    mafiaSealLimitThisRound: getMafiaSealLimit(room),
    linkedTargetId: linkedPlayer ? linkedPlayer.id : null,
    linkedTargetName: linkedPlayer ? linkedPlayer.name : null,
    pirateWins: viewer.pirateWins,
    usedGhostWhisper: viewer.usedGhostWhisper,
    secretNotes: viewer.secretNotes,
    tribunalChat: room.tribunalChat,
    mafiaChat: isMafia ? room.mafiaChat : [],
    mediumChat: canSeeMedium ? room.mediumChat : [],
    ghostChat: canSeeGhosts ? room.ghostChat : [],
    dungeonChat: canSeeDungeon ? room.dungeonChat : [],
    mediumRevealedIdentity: viewer.mediumRevealedIdentity,
    urnSubmitted: viewer.urnSubmitted,
    urnQueuedSlip:
      viewer.urnQueuedSlip && viewer.urnQueuedSlip !== 'blank'
        ? viewer.urnQueuedSlip
        : null,
    urnQueuedTargetId: viewer.urnQueuedTargetId,
    vestActivated: viewer.vestActivated,
  };
}

function broadcastRoom(room: RoomState): void {
  for (const player of room.players) {
    const payload: RoomSyncPayload = {
      publicState: buildPublicStateForViewer(room, player),
      privateState: buildPrivateStateForViewer(room, player),
    };
    sendToWs(player.ws, { type: 'SYNC', payload });
  }
}

function computeDeckPreview(room: RoomState): RoleId[] {
  const n = room.players.length;
  if (room.deckMode === 'classic') {
    return generateClassicDeck(n);
  }
  if (room.deckMode === 'categories') {
    return generateCategoriesDeck(n);
  }
  return room.customDeck;
}

function convertDependentRoleToGuest(
  room: RoomState,
  targetId: string,
  reason: 'non_tribunal' | 'any'
): void {
  for (const p of room.players) {
    if (!p.alive) continue;
    if (p.roleId === 'anjo_da_guarda' && p.linkedTargetId === targetId) {
      p.roleId = 'convidado';
      p.stickers = { orange_deco: 12 };
      p.linkedTargetId = null;
      addPrivateNote(
        p,
        room.round,
        'Seu protegido morreu! Conforme as regras, você se tornou um Convidado (Cidade).'
      );
    }
    if (
      reason === 'non_tribunal' &&
      p.roleId === 'carrasco' &&
      p.linkedTargetId === targetId
    ) {
      p.roleId = 'convidado';
      p.stickers = { orange_deco: 12 };
      p.linkedTargetId = null;
      addPrivateNote(
        p,
        room.round,
        'Seu alvo morreu fora do Tribunal! Conforme as regras, você se tornou um Convidado (Cidade).'
      );
    }
  }
}

function checkVictoryConditions(room: RoomState): boolean {
  if (room.phase === 'FIM_DE_JOGO') return true;

  const living = room.players.filter((p) => p.alive);
  const livingMafia = living.filter(
    (p) => p.roleId && ROLES[p.roleId].faction === 'MAFIA'
  );
  const livingNeutralKillers = living.filter(
    (p) => p.roleId && ROLES[p.roleId].faction === 'NEUTRO_MATADOR'
  );

  let winningFactions: Faction[] = [];
  let winHeadline = '';

  // Neutral Killers win when <= 2 living players remain and at least one NK is alive
  if (living.length <= 2 && livingNeutralKillers.length > 0) {
    winningFactions = ['NEUTRO_MATADOR'];
    const names = livingNeutralKillers.map((p) => p.name).join(' & ');
    winHeadline = `Vitória dos Matadores Neutros (${names})!`;
  } else if (
    livingMafia.length > 0 &&
    livingMafia.length * 2 >= living.length &&
    livingNeutralKillers.length === 0
  ) {
    winningFactions = ['MAFIA'];
    winHeadline = 'Vitória da Máfia! Os mafiosos dominaram a cidade.';
  } else if (livingMafia.length === 0 && livingNeutralKillers.length === 0) {
    winningFactions = ['CIDADE'];
    winHeadline = 'Vitória da Cidade! Todas as ameaças foram eliminadas.';
  } else if (living.length <= 2 && livingMafia.length > 0 && livingMafia.length * 2 >= living.length) {
    winningFactions = ['MAFIA'];
    winHeadline = 'Vitória da Máfia! Os mafiosos dominaram a cidade.';
  }

  if (winningFactions.length === 0) {
    return false;
  }

  clearPhaseTimer(room);
  room.phase = 'FIM_DE_JOGO';
  room.winningFactions = winningFactions;
  room.winHeadline = winHeadline;

  // Check Sobrevivente and Anjo da Guarda end-of-game wins
  for (const p of room.players) {
    if (p.roleId === 'sobrevivente' && p.alive) {
      p.individualWin = true;
    }
    if (p.roleId === 'anjo_da_guarda' && p.linkedTargetId) {
      const prot = room.players.find((x) => x.id === p.linkedTargetId);
      if (prot && prot.alive) {
        p.individualWin = true;
      }
    }
  }

  const winners = new Set<string>();
  for (const p of room.players) {
    if (p.individualWin) winners.add(p.id);
    if (p.roleId && winningFactions.includes(ROLES[p.roleId].faction)) {
      winners.add(p.id);
    }
  }
  room.winnerPlayerIds = Array.from(winners);

  addChronicle(room, winHeadline, 'win');
  broadcastSound(room, 'victory');
  broadcastRoom(room);
  return true;
}

function startCacadaPhase(room: RoomState): void {
  clearPhaseTimer(room);
  room.round += 1;
  room.phase = 'CACADA';
  room.mafiaSealUsedThisRound = 0;
  room.jailedPlayerId = null;
  room.jailorPlayerId = null;
  room.pendingReviveTargetId = null;
  room.pendingReviveCasterId = null;
  room.votes = {};
  room.activeDuel = null;
  room.dungeonChat = [];
  room.lastBellAnnouncements = [];

  const shuffledMissions = shuffleArray(SECRET_MISSIONS);
  let missionIdx = 0;

  for (const p of room.players) {
    p.blockedThisRound = false;
    p.jailedThisRound = false;
    p.usedRoundAction = false;
    p.usedOrangeThisRound = false;
    p.readyForNext = false;
    p.urnSubmitted = false;
    p.urnQueuedSlip = null;
    p.urnQueuedTargetId = null;
    p.vestActivated = false;
    // Clear silenced after Tribunal ended
    p.silenced = false;

    if (p.alive) {
      p.secretMission = shuffledMissions[missionIdx % shuffledMissions.length];
      p.secretMissionDone = false;
      missionIdx++;
    } else {
      p.secretMission = null;
    }
  }

  addChronicle(room, `Rodada ${room.round} — A Caçada começou.`, 'info');

  if (room.cacadaMinutes > 0) {
    const durationMs = room.cacadaMinutes * 60 * 1000;
    room.phaseEndsAt = Date.now() + durationMs;
    room.phaseTimer = setTimeout(() => {
      if (room.phase === 'CACADA') {
        startBadaladaPhase(room);
      }
    }, durationMs);
  }

  broadcastRoom(room);
}

function startBadaladaPhase(room: RoomState): void {
  clearPhaseTimer(room);
  room.phase = 'BADALADA';
  room.activeDuel = null;

  for (const p of room.players) {
    p.readyForNext = false;
    p.urnSubmitted = false;
  }

  addChronicle(room, `Badalada da Rodada ${room.round}! Todos passam pela Urna.`, 'info');
  broadcastSound(room, 'badalada');

  // 25s automatic window for Urna anonymous submission
  const durationMs = 25_000;
  room.phaseEndsAt = Date.now() + durationMs;
  room.phaseTimer = setTimeout(() => {
    if (room.phase === 'BADALADA') {
      resolveDancaDosSelos(room);
    }
  }, durationMs);

  broadcastRoom(room);
}

function resolveDancaDosSelos(room: RoomState): void {
  clearPhaseTimer(room);
  room.phase = 'DANCA_DOS_SELOS';
  const announcements: string[] = [];

  // 1. Collect Urna slips from living, unblocked players
  let fireLit = false;
  const bulletTargets: Array<{ caster: ServerPlayer; target: ServerPlayer }> = [];
  const executionTargets: Array<{ caster: ServerPlayer; target: ServerPlayer }> = [];
  const silenceTargets: Array<{ caster: ServerPlayer; target: ServerPlayer }> = [];

  for (const p of room.players) {
    p.readyForNext = false;
    if (!p.alive || p.blockedThisRound) continue;
    const slip = p.urnQueuedSlip;
    if (!slip || slip === 'blank') continue;

    if (slip === 'match' && p.roleId === 'incendiario' && (p.slips.match || 0) > 0) {
      p.slips.match = (p.slips.match || 0) - 1;
      fireLit = true;
    } else if (
      slip === 'bullet' &&
      p.roleId === 'justiceiro' &&
      (p.slips.bullet || 0) > 0 &&
      p.urnQueuedTargetId
    ) {
      const target = room.players.find((t) => t.id === p.urnQueuedTargetId && t.alive);
      if (target) {
        p.slips.bullet = (p.slips.bullet || 0) - 1;
        bulletTargets.push({ caster: p, target });
      }
    } else if (
      slip === 'execution' &&
      p.roleId === 'carcereiro' &&
      (p.slips.execution || 0) > 0 &&
      p.urnQueuedTargetId
    ) {
      const target = room.players.find((t) => t.id === p.urnQueuedTargetId && t.alive);
      if (target) {
        p.slips.execution = (p.slips.execution || 0) - 1;
        executionTargets.push({ caster: p, target });
      }
    } else if (
      slip === 'silence' &&
      p.roleId === 'chantagista' &&
      (p.slips.silence || 0) > 0 &&
      p.urnQueuedTargetId
    ) {
      const target = room.players.find((t) => t.id === p.urnQueuedTargetId && t.alive);
      if (target) {
        p.slips.silence = (p.slips.silence || 0) - 1;
        silenceTargets.push({ caster: p, target });
      }
    }
  }

  if (fireLit) {
    announcements.push('FÓSFORO! Alguém acendeu o fósforo na Urna!');
    addChronicle(room, 'FÓSFORO! Alguém acendeu o fósforo na Urna!', 'death');
  }

  for (const { target } of silenceTargets) {
    target.silenced = true;
    const msg = `CALE-SE! ${target.name} foi silenciado e só poderá ouvir e votar no próximo Tribunal.`;
    announcements.push(msg);
    addChronicle(room, msg, 'info');
  }

  // Bullet & Execution bypass Amulet, Shield, and Vest!
  const newlyDeadIds = new Set<string>();

  for (const { caster, target } of executionTargets) {
    if (target.alive) {
      target.alive = false;
      target.deathCause = 'EXECUCAO';
      newlyDeadIds.add(target.id);
      const msg = `EXECUÇÃO! ${target.name} foi executado na Masmorra.`;
      announcements.push(msg);
      addChronicle(room, msg, 'death');
    }
    void caster;
  }

  for (const { caster, target } of bulletTargets) {
    if (target.alive) {
      target.alive = false;
      target.deathCause = 'BALA';
      newlyDeadIds.add(target.id);
      const msg = `BALA! Um disparo acertou ${target.name} em cheio.`;
      announcements.push(msg);
      addChronicle(room, msg, 'death');

      if (target.roleId && ROLES[target.roleId].faction === 'CIDADE') {
        caster.alive = false;
        caster.deathCause = 'CULPA_JUSTICEIRO';
        caster.revealedPublicly = true;
        newlyDeadIds.add(caster.id);
        const guiltMsg = `CULPA! ${caster.name} era o Justiceiro, atirou em um membro da Cidade e morreu de remorso!`;
        announcements.push(guiltMsg);
        addChronicle(room, guiltMsg, 'reveal');
      }
    }
  }

  // 2. Dança dos Selos: evaluate marks on living players
  for (const p of room.players) {
    if (!p.alive) {
      p.backMarks = [];
      continue;
    }

    const hasRed = p.backMarks.some((m) => m.sticker === 'red_seal');
    const hasBlack = p.backMarks.some((m) => m.sticker === 'black_seal');
    const hasFire = fireLit && p.backMarks.some((m) => m.sticker === 'blue_drop');
    const hasAmulet = p.backMarks.some((m) => m.sticker === 'white_amulet');
    const shieldRecord = p.backMarks.find((m) => m.sticker === 'gold_shield');

    const isAttacked = hasRed || hasBlack || hasFire;

    if (isAttacked) {
      if (p.vestActivated && p.roleId === 'sobrevivente' && (p.slips.vest || 0) > 0) {
        p.slips.vest = (p.slips.vest || 0) - 1;
        const msg = `COLETE! ${p.name} gritou COLETE e sobreviveu aos ataques da Badalada!`;
        announcements.push(msg);
        addChronicle(room, msg, 'info');
        p.backMarks = p.backMarks.filter(
          (m) => m.sticker === 'blue_drop' && !fireLit
        );
      } else if (hasAmulet) {
        const msg = `SALVO! Um Amuleto Branco protegeu ${p.name} — todos os seus adesivos saíram!`;
        announcements.push(msg);
        addChronicle(room, msg, 'info');
        p.backMarks = [];
      } else if (shieldRecord) {
        const bodyguard = room.players.find(
          (bg) => bg.id === shieldRecord.placedBy && bg.alive
        );
        if (bodyguard) {
          bodyguard.alive = false;
          bodyguard.deathCause = 'GUARDA_COSTAS';
          newlyDeadIds.add(bodyguard.id);
          const msg = `EU PROTEJO! ${bodyguard.name} sacrificou-se pelo Escudo Dourado e morreu no lugar de ${p.name}!`;
          announcements.push(msg);
          addChronicle(room, msg, 'death');
          p.backMarks = p.backMarks.filter(
            (m) => m.sticker === 'blue_drop' && !fireLit
          );
        } else {
          // Bodyguard no longer alive to intercept
          p.alive = false;
          p.deathCause = hasFire
            ? 'FOGO'
            : hasRed
              ? 'SELO_MAFIA'
              : 'SELO_ASSASSINO';
          newlyDeadIds.add(p.id);
          const msg = hasFire
            ? `QUEIMOU! ${p.name} foi consumido pelo fogo.`
            : `SELO! ${p.name} caiu marcado na Dança dos Selos.`;
          announcements.push(msg);
          addChronicle(room, msg, 'death');
          p.backMarks = [];
        }
      } else {
        p.alive = false;
        p.deathCause = hasFire
          ? 'FOGO'
          : hasRed
            ? 'SELO_MAFIA'
            : 'SELO_ASSASSINO';
        newlyDeadIds.add(p.id);
        const msg = hasFire
          ? `QUEIMOU! ${p.name} foi consumido pelo fogo.`
          : `SELO! ${p.name} caiu marcado na Dança dos Selos.`;
        announcements.push(msg);
        addChronicle(room, msg, 'death');
        p.backMarks = [];
      }
    } else {
      // Not attacked: if player has white_amulet, PDF says all stickers are removed on Badalada?
      // "Na Badalada, quem tiver amuleto se salva de selo e de fogo, e todos os adesivos dela são removidos."
      // "Gotas azuis sem Fósforo ficam nas costas."
      if (hasAmulet) {
        p.backMarks = [];
      } else {
        p.backMarks = p.backMarks.filter((m) => m.sticker === 'blue_drop');
      }
    }
  }

  // 3. Retribucionista revival check
  if (room.pendingReviveTargetId && room.pendingReviveCasterId) {
    const caster = room.players.find((p) => p.id === room.pendingReviveCasterId);
    const target = room.players.find((p) => p.id === room.pendingReviveTargetId);
    if (caster && !caster.blockedThisRound && target && !target.alive && target.roleId) {
      if (ROLES[target.roleId].faction === 'CIDADE') {
        target.alive = true;
        target.deathCause = null;
        const msg = `RETRIBUIÇÃO! ${target.name} voltou dos mortos na Badalada!`;
        announcements.push(msg);
        addChronicle(room, msg, 'reveal');
      } else {
        addPrivateNote(
          caster,
          room.round,
          `${target.name} não pertencia à Cidade. Sua tentativa única de Retribuição falhou.`
        );
      }
    }
  }

  if (announcements.length === 0) {
    announcements.push('A Dança dos Selos terminou sem baixas nesta rodada.');
    addChronicle(room, 'Ninguém morreu na Badalada desta rodada.', 'info');
  }

  room.lastBellAnnouncements = announcements;

  // Convert Carrasco / Anjo if their target died outside Tribunal
  for (const deadId of newlyDeadIds) {
    convertDependentRoleToGuest(room, deadId, 'non_tribunal');
  }

  if (checkVictoryConditions(room)) return;

  // Show Dança dos Selos results briefly, then move to Tribunal
  const durationMs = 10_000;
  room.phaseEndsAt = Date.now() + durationMs;
  room.phaseTimer = setTimeout(() => {
    if (room.phase === 'DANCA_DOS_SELOS') {
      startTribunalPhase(room);
    }
  }, durationMs);

  broadcastRoom(room);
}

function startTribunalPhase(room: RoomState): void {
  clearPhaseTimer(room);
  room.phase = 'TRIBUNAL';
  room.votes = {};
  for (const p of room.players) {
    p.readyForNext = false;
  }

  addChronicle(
    room,
    room.marshalDoubleElimination
      ? `Tribunal da Rodada ${room.round} (Marechal ativo: os 2 mais apontados serão presos!).`
      : `Tribunal da Rodada ${room.round} aberto.`,
    'info'
  );
  broadcastSound(room, 'tribunal');

  if (room.tribunalMinutes > 0) {
    const durationMs = room.tribunalMinutes * 60 * 1000;
    room.phaseEndsAt = Date.now() + durationMs;
    room.phaseTimer = setTimeout(() => {
      if (room.phase === 'TRIBUNAL') {
        resolveTribunalVotes(room);
      }
    }, durationMs);
  }

  broadcastRoom(room);
}

function resolveTribunalVotes(room: RoomState): void {
  clearPhaseTimer(room);

  const tally = new Map<string, number>();
  const votersByTarget = new Map<string, string[]>();

  for (const p of room.players) {
    if (!p.alive) continue;
    const choice = room.votes[p.id];
    if (!choice || choice === 'SKIP') continue;
    const target = room.players.find((t) => t.id === choice && t.alive);
    if (!target) continue;

    const weight = p.revealedPublicly && p.roleId === 'prefeito' ? 3 : 1;
    tally.set(target.id, (tally.get(target.id) || 0) + weight);
    const list = votersByTarget.get(target.id) || [];
    list.push(p.id);
    votersByTarget.set(target.id, list);
  }

  const entries = Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
  const arrestedPlayers: ServerPlayer[] = [];

  if (entries.length === 0) {
    addChronicle(room, 'Tribunal encerrado: ninguém recebeu votos. Ninguém foi preso.', 'info');
  } else if (room.marshalDoubleElimination) {
    // Top 2 most voted are arrested
    const first = room.players.find((p) => p.id === entries[0][0]);
    if (first) arrestedPlayers.push(first);
    if (entries.length > 1) {
      const second = room.players.find((p) => p.id === entries[1][0]);
      if (second) arrestedPlayers.push(second);
    }
  } else {
    const topVotes = entries[0][1];
    const tied = entries.filter((e) => e[1] === topVotes);
    if (tied.length > 1) {
      addChronicle(
        room,
        `Empate no Tribunal (${topVotes} votos)! Ninguém foi preso.`,
        'info'
      );
    } else {
      const prisoner = room.players.find((p) => p.id === entries[0][0]);
      if (prisoner) arrestedPlayers.push(prisoner);
    }
  }

  room.marshalDoubleElimination = false;

  let triggeredJester: ServerPlayer | null = null;

  for (const prisoner of arrestedPlayers) {
    prisoner.alive = false;
    prisoner.deathCause = 'TRIBUNAL';
    prisoner.revealedPublicly = true;
    const roleName = prisoner.roleId ? ROLES[prisoner.roleId].name : 'Desconhecido';
    addChronicle(
      room,
      `TRIBUNAL! ${prisoner.name} foi preso e revelou seu pergaminho: ${roleName}!`,
      'reveal'
    );

    // Check Bobo da Corte
    if (prisoner.roleId === 'bobo_da_corte') {
      prisoner.individualWin = true;
      addChronicle(
        room,
        `CAOS! ${prisoner.name} era o BOBO DA CORTE e venceu sozinho ao ser preso!`,
        'win'
      );
      const voters = (votersByTarget.get(prisoner.id) || []).filter((vid) => {
        const vp = room.players.find((x) => x.id === vid);
        return vp && vp.alive;
      });
      if (voters.length > 0 && !triggeredJester) {
        triggeredJester = prisoner;
        room.pendingJesterId = prisoner.id;
        room.pendingJesterVoterIds = voters;
      }
    }

    // Check Carrasco
    for (const carrasco of room.players) {
      if (
        carrasco.alive &&
        carrasco.roleId === 'carrasco' &&
        carrasco.linkedTargetId === prisoner.id
      ) {
        carrasco.individualWin = true;
        addChronicle(
          room,
          `CARRASCO! ${carrasco.name} cumpriu seu objetivo ao prender ${prisoner.name} e venceu sozinho!`,
          'win'
        );
      }
    }

    // Check Anjo da Guarda (target arrested -> Anjo becomes Convidado)
    convertDependentRoleToGuest(room, prisoner.id, 'any');
  }

  if (triggeredJester) {
    // Wait up to 20s for Bobo da Corte to pick 1 voter to drag into Ghost status
    room.phaseEndsAt = Date.now() + 20_000;
    room.phaseTimer = setTimeout(() => {
      if (room.pendingJesterId) {
        room.pendingJesterId = null;
        room.pendingJesterVoterIds = [];
        if (!checkVictoryConditions(room)) {
          startCacadaPhase(room);
        }
      }
    }, 20_000);
    broadcastRoom(room);
    return;
  }

  if (checkVictoryConditions(room)) return;
  startCacadaPhase(room);
}

function createPlayer(name: string, token: string, seatIndex: number, isHost: boolean, ws: WebSocket): ServerPlayer {
  return {
    id: uid('pl'),
    token,
    name: name.trim().slice(0, 24) || 'Convidado',
    seatIndex,
    connected: true,
    isHost,
    alive: true,
    deathCause: null,
    revealedPublicly: false,
    roleId: null,
    originalRoleId: null,
    stickers: {},
    slips: {},
    backMarks: [],
    secretMission: null,
    secretMissionDone: false,
    blockedThisRound: false,
    jailedThisRound: false,
    usedRoundAction: false,
    usedOrangeThisRound: false,
    usedOncePerGame: false,
    silenced: false,
    readyForNext: false,
    individualWin: false,
    linkedTargetId: null,
    pirateWins: 0,
    usedGhostWhisper: false,
    secretNotes: [],
    mediumRevealedIdentity: false,
    urnSubmitted: false,
    urnQueuedSlip: null,
    urnQueuedTargetId: null,
    vestActivated: false,
    ws,
  };
}

function handleClientAction(ws: WebSocket, msg: ClientActionMessage, clientContext: { roomCode: string | null; playerId: string | null }): void {
  if (msg.type === 'CREATE_ROOM') {
    const code = generateRoomCode();
    const token = msg.playerToken || uid('tok');
    const host = createPlayer(msg.name, token, 0, true, ws);
    const room: RoomState = {
      roomCode: code,
      phase: 'LOBBY',
      round: 0,
      phaseEndsAt: null,
      phaseTimer: null,
      deckMode: 'classic',
      customDeck: [],
      publicRoleList: generateClassicDeck(1),
      cacadaMinutes: 5,
      tribunalMinutes: 3,
      killerPace: 'normal',
      hideBackMarksUntilBell: false,
      players: [host],
      mafiaSealUsedThisRound: 0,
      jailedPlayerId: null,
      jailorPlayerId: null,
      pendingReviveTargetId: null,
      pendingReviveCasterId: null,
      marshalDoubleElimination: false,
      votes: {},
      pendingJesterId: null,
      pendingJesterVoterIds: [],
      activeDuel: null,
      tribunalChat: [],
      mafiaChat: [],
      mediumChat: [],
      ghostChat: [],
      dungeonChat: [],
      chronicle: [],
      lastBellAnnouncements: [],
      winningFactions: [],
      winnerPlayerIds: [],
      winHeadline: null,
    };
    rooms.set(code, room);
    clientContext.roomCode = code;
    clientContext.playerId = host.id;
    broadcastRoom(room);
    return;
  }

  if (msg.type === 'JOIN_ROOM') {
    const code = msg.roomCode.trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      sendToWs(ws, { type: 'ERROR', message: `Sala "${code}" não encontrada.` });
      return;
    }

    // Check reconnection by token
    const existing = msg.playerToken
      ? room.players.find((p) => p.token === msg.playerToken)
      : undefined;

    if (existing) {
      existing.ws = ws;
      existing.connected = true;
      if (msg.name.trim()) {
        existing.name = msg.name.trim().slice(0, 24);
      }
      clientContext.roomCode = code;
      clientContext.playerId = existing.id;
      broadcastRoom(room);
      return;
    }

    if (room.phase !== 'LOBBY') {
      sendToWs(ws, { type: 'ERROR', message: 'A partida já começou nesta sala.' });
      return;
    }

    if (room.players.length >= 20) {
      sendToWs(ws, { type: 'ERROR', message: 'Sala cheia (máximo 20 jogadores).' });
      return;
    }

    const duplicateName = room.players.some(
      (p) => p.name.toLowerCase() === msg.name.trim().toLowerCase()
    );
    const cleanName = duplicateName
      ? `${msg.name.trim().slice(0, 20)} ${room.players.length + 1}`
      : msg.name.trim().slice(0, 24);

    const token = msg.playerToken || uid('tok');
    const newPlayer = createPlayer(cleanName, token, room.players.length, false, ws);
    room.players.push(newPlayer);
    room.publicRoleList = computeDeckPreview(room);
    clientContext.roomCode = code;
    clientContext.playerId = newPlayer.id;
    broadcastRoom(room);
    return;
  }

  // All other actions require valid room + player
  if (!clientContext.roomCode || !clientContext.playerId) {
    sendToWs(ws, { type: 'ERROR', message: 'Você não está conectado a uma sala.' });
    return;
  }
  const room = rooms.get(clientContext.roomCode);
  if (!room) return;
  const player = room.players.find((p) => p.id === clientContext.playerId);
  if (!player) return;

  switch (msg.type) {
    case 'REORDER_SEAT': {
      if (!player.isHost || room.phase !== 'LOBBY') return;
      const sorted = [...room.players].sort((a, b) => a.seatIndex - b.seatIndex);
      const idx = sorted.findIndex((p) => p.id === msg.playerId);
      if (idx === -1) return;
      const swapIdx = msg.direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return;
      const tempSeat = sorted[idx].seatIndex;
      sorted[idx].seatIndex = sorted[swapIdx].seatIndex;
      sorted[swapIdx].seatIndex = tempSeat;
      broadcastRoom(room);
      return;
    }

    case 'SHUFFLE_SEATS': {
      if (!player.isHost || room.phase !== 'LOBBY') return;
      const shuffled = shuffleArray(room.players);
      shuffled.forEach((p, idx) => {
        p.seatIndex = idx;
      });
      broadcastRoom(room);
      return;
    }

    case 'UPDATE_SETTINGS': {
      if (!player.isHost || room.phase !== 'LOBBY') return;
      if (msg.deckMode) room.deckMode = msg.deckMode;
      if (msg.customDeck) room.customDeck = msg.customDeck;
      if (typeof msg.cacadaMinutes === 'number') room.cacadaMinutes = msg.cacadaMinutes;
      if (typeof msg.tribunalMinutes === 'number') room.tribunalMinutes = msg.tribunalMinutes;
      if (msg.killerPace) room.killerPace = msg.killerPace;
      if (typeof msg.hideBackMarksUntilBell === 'boolean') {
        room.hideBackMarksUntilBell = msg.hideBackMarksUntilBell;
      }
      room.publicRoleList = computeDeckPreview(room);
      broadcastRoom(room);
      return;
    }

    case 'START_GAME': {
      if (!player.isHost || room.phase !== 'LOBBY') return;
      if (room.players.length < 4) {
        sendToWs(ws, {
          type: 'ERROR',
          message: 'São necessários pelo menos 4 jogadores para iniciar.',
        });
        return;
      }

      const deck = computeDeckPreview(room);
      if (deck.length !== room.players.length) {
        sendToWs(ws, {
          type: 'ERROR',
          message: `O baralho tem ${deck.length} papéis, mas há ${room.players.length} jogadores.`,
        });
        return;
      }

      const orderedPlayers = [...room.players].sort((a, b) => a.seatIndex - b.seatIndex);
      const shuffledDeck = shuffleArray(deck);
      room.publicRoleList = [...deck];
      room.round = 0;
      room.chronicle = [];
      room.tribunalChat = [];
      room.mafiaChat = [];
      room.mediumChat = [];
      room.ghostChat = [];
      room.dungeonChat = [];
      room.winningFactions = [];
      room.winnerPlayerIds = [];
      room.winHeadline = null;
      room.marshalDoubleElimination = false;

      const n = orderedPlayers.length;
      orderedPlayers.forEach((p, i) => {
        const roleId = shuffledDeck[i];
        const def = ROLES[roleId];
        p.roleId = roleId;
        p.originalRoleId = roleId;
        p.alive = true;
        p.deathCause = null;
        p.revealedPublicly = false;
        p.stickers = { ...def.initialStickers };
        p.slips = { ...def.initialSlips };
        p.backMarks = [];
        p.secretNotes = [];
        p.blockedThisRound = false;
        p.jailedThisRound = false;
        p.usedRoundAction = false;
        p.usedOrangeThisRound = false;
        p.usedOncePerGame = false;
        p.silenced = false;
        p.readyForNext = false;
        p.individualWin = false;
        p.pirateWins = 0;
        p.usedGhostWhisper = false;
        p.mediumRevealedIdentity = false;
        p.urnSubmitted = false;
        p.urnQueuedSlip = null;
        p.urnQueuedTargetId = null;
        p.vestActivated = false;

        if (roleId === 'anjo_da_guarda') {
          const rightNeighbor = orderedPlayers[(i + 1) % n];
          p.linkedTargetId = rightNeighbor.id;
        } else if (roleId === 'carrasco') {
          const leftNeighbor = orderedPlayers[(i - 1 + n) % n];
          p.linkedTargetId = leftNeighbor.id;
        } else {
          p.linkedTargetId = null;
        }
      });

      room.phase = 'NOITE_ZERO';
      addChronicle(room, 'Noite Zero iniciada. A Máfia se reconhece em silêncio.', 'info');
      broadcastSound(room, 'noite_zero');

      const durationMs = 45_000;
      room.phaseEndsAt = Date.now() + durationMs;
      room.phaseTimer = setTimeout(() => {
        if (room.phase === 'NOITE_ZERO') {
          startCacadaPhase(room);
        }
      }, durationMs);

      broadcastRoom(room);
      return;
    }

    case 'ADVANCE_PHASE': {
      if (!player.isHost) return;
      if (room.phase === 'NOITE_ZERO') startCacadaPhase(room);
      else if (room.phase === 'CACADA') startBadaladaPhase(room);
      else if (room.phase === 'BADALADA') resolveDancaDosSelos(room);
      else if (room.phase === 'DANCA_DOS_SELOS') startTribunalPhase(room);
      else if (room.phase === 'TRIBUNAL') resolveTribunalVotes(room);
      return;
    }

    case 'TOGGLE_READY': {
      if (room.phase === 'LOBBY' || room.phase === 'FIM_DE_JOGO') return;
      player.readyForNext = !player.readyForNext;
      const living = room.players.filter((p) => p.alive);
      if (living.length > 0 && living.every((p) => p.readyForNext)) {
        if (room.phase === 'NOITE_ZERO') startCacadaPhase(room);
        else if (room.phase === 'CACADA') startBadaladaPhase(room);
        else if (room.phase === 'DANCA_DOS_SELOS') startTribunalPhase(room);
      } else {
        broadcastRoom(room);
      }
      return;
    }

    case 'COMPLETE_MISSION': {
      if (room.phase !== 'CACADA' || !player.alive) return;
      player.secretMissionDone = !player.secretMissionDone;
      broadcastRoom(room);
      return;
    }

    case 'APPLY_STICKER': {
      if (room.phase !== 'CACADA' || !player.alive || !player.roleId) return;
      const target = room.players.find((t) => t.id === msg.targetId && t.alive);
      if (!target) return;

      if (msg.sticker === 'orange_deco') {
        if (player.usedOrangeThisRound) {
          sendToWs(ws, { type: 'ERROR', message: 'Você já colou um adesivo laranja nesta rodada.' });
          return;
        }
        if ((player.stickers.orange_deco || 0) <= 0) return;
        player.stickers.orange_deco = (player.stickers.orange_deco || 0) - 1;
        player.usedOrangeThisRound = true;
        target.backMarks.push({ sticker: 'orange_deco', placedBy: player.id, roundPlaced: room.round });
        sendToWs(ws, { type: 'TOAST', message: `Adesivo Laranja colado nas costas de ${target.name}.` });
        broadcastRoom(room);
        return;
      }

      if (player.blockedThisRound) {
        sendToWs(ws, { type: 'ERROR', message: 'Você foi bloqueado nesta rodada e não pode colar selos especiais.' });
        return;
      }

      const sticker = msg.sticker;
      if ((player.stickers[sticker] || 0) <= 0) {
        sendToWs(ws, { type: 'ERROR', message: 'Você não tem mais este adesivo.' });
        return;
      }

      if (sticker === 'red_seal') {
        if (player.roleId !== 'chefao' && player.roleId !== 'mafioso') return;
        if (room.mafiaSealUsedThisRound >= getMafiaSealLimit(room)) {
          sendToWs(ws, { type: 'ERROR', message: 'A Máfia já atingiu o limite de selos vermelhos desta rodada.' });
          return;
        }
        room.mafiaSealUsedThisRound += 1;
        player.stickers.red_seal = (player.stickers.red_seal || 0) - 1;
        player.usedRoundAction = true;
        target.backMarks.push({ sticker: 'red_seal', placedBy: player.id, roundPlaced: room.round });
      } else if (sticker === 'black_seal') {
        if (player.roleId !== 'assassino_em_serie') return;
        if (player.usedRoundAction || getSerialKillerLimit(room) === 0) {
          sendToWs(ws, { type: 'ERROR', message: 'Você não pode colar outro Selo Negro nesta rodada.' });
          return;
        }
        player.stickers.black_seal = (player.stickers.black_seal || 0) - 1;
        player.usedRoundAction = true;
        target.backMarks.push({ sticker: 'black_seal', placedBy: player.id, roundPlaced: room.round });
      } else if (sticker === 'blue_drop') {
        if (player.roleId !== 'incendiario') return;
        if (target.id === player.id) return;
        if (target.backMarks.some((m) => m.sticker === 'blue_drop')) {
          sendToWs(ws, { type: 'ERROR', message: `${target.name} já possui uma Gota Azul nas costas.` });
          return;
        }
        player.stickers.blue_drop = (player.stickers.blue_drop || 0) - 1;
        target.backMarks.push({ sticker: 'blue_drop', placedBy: player.id, roundPlaced: room.round });
      } else if (sticker === 'white_amulet') {
        if (player.roleId !== 'doutor' && player.roleId !== 'anjo_da_guarda') return;
        if (player.roleId === 'doutor' && target.id === player.id) {
          sendToWs(ws, { type: 'ERROR', message: 'O Doutor só pode colocar amuleto em outra pessoa.' });
          return;
        }
        if (player.roleId === 'anjo_da_guarda' && target.id !== player.linkedTargetId) {
          sendToWs(ws, { type: 'ERROR', message: 'Você só pode colocar amuleto no seu Protegido.' });
          return;
        }
        if (player.usedRoundAction) {
          sendToWs(ws, { type: 'ERROR', message: 'Você já usou seu Amuleto nesta rodada.' });
          return;
        }
        player.stickers.white_amulet = (player.stickers.white_amulet || 0) - 1;
        player.usedRoundAction = true;
        target.backMarks.push({ sticker: 'white_amulet', placedBy: player.id, roundPlaced: room.round });
      } else if (sticker === 'gold_shield') {
        if (player.roleId !== 'guarda_costas' || target.id === player.id) return;
        if (player.usedRoundAction) {
          sendToWs(ws, { type: 'ERROR', message: 'Você já colocou seu Escudo Dourado nesta rodada.' });
          return;
        }
        player.stickers.gold_shield = (player.stickers.gold_shield || 0) - 1;
        player.usedRoundAction = true;
        target.backMarks.push({ sticker: 'gold_shield', placedBy: player.id, roundPlaced: room.round });
      } else {
        return;
      }

      sendToWs(ws, { type: 'TOAST', message: `Marca aplicada secretamente em ${target.name}.` });
      broadcastRoom(room);
      return;
    }

    case 'INVESTIGATE': {
      if (room.phase !== 'CACADA' || !player.alive || !player.roleId) return;
      if (player.blockedThisRound) {
        sendToWs(ws, { type: 'ERROR', message: 'Você está bloqueado nesta rodada.' });
        return;
      }
      if (player.usedRoundAction) {
        sendToWs(ws, { type: 'ERROR', message: 'Você já realizou sua investigação nesta rodada.' });
        return;
      }
      const target = room.players.find((t) => t.id === msg.targetId);
      if (!target || !target.roleId || target.id === player.id) return;
      const targetRole = ROLES[target.roleId];

      if (player.roleId === 'xerife') {
        if (!target.alive) return;
        player.usedRoundAction = true;
        addPrivateNote(
          player,
          room.round,
          `Investigação (Xerife) em ${target.name}: Aparência ${targetRole.appearance}.`
        );
      } else if (player.roleId === 'investigador') {
        if (!target.alive) return;
        player.usedRoundAction = true;
        addPrivateNote(
          player,
          room.round,
          `Investigação (Investigador) em ${target.name}: Grupo ${targetRole.groupLabel}.`
        );
      } else if (player.roleId === 'conselheiro') {
        if (!target.alive) return;
        player.usedRoundAction = true;
        addPrivateNote(
          player,
          room.round,
          `Investigação (Conselheiro) em ${target.name}: Papel exato é ${targetRole.name} (${targetRole.groupLabel}).`
        );
      } else if (player.roleId === 'legista') {
        if (target.alive || target.revealedPublicly) {
          sendToWs(ws, {
            type: 'ERROR',
            message: 'O Legista só pode examinar fantasmas que morreram sem revelar no Tribunal.',
          });
          return;
        }
        player.usedRoundAction = true;
        addPrivateNote(
          player,
          room.round,
          `Exame (Legista) em ${target.name}: Papel exato era ${targetRole.name} (${targetRole.groupLabel}).`
        );
      } else {
        return;
      }

      sendToWs(ws, { type: 'TOAST', message: `Resultado secreto registrado no seu Pergaminho.` });
      broadcastRoom(room);
      return;
    }

    case 'BLOCK_PLAYER': {
      if (room.phase !== 'CACADA' || !player.alive) return;
      if (player.roleId !== 'dancarina' && player.roleId !== 'consorte') return;
      if (player.blockedThisRound || player.usedRoundAction) {
        sendToWs(ws, { type: 'ERROR', message: 'Você não pode bloquear novamente nesta rodada.' });
        return;
      }
      const target = room.players.find((t) => t.id === msg.targetId && t.alive);
      if (!target || target.id === player.id) return;

      player.usedRoundAction = true;
      target.blockedThisRound = true;
      // Retroactively neutralize any offensive/protective sticker or queued slip placed by target this round
      for (const p of room.players) {
        const before = p.backMarks.length;
        p.backMarks = p.backMarks.filter(
          (m) => !(m.placedBy === target.id && m.roundPlaced === room.round && m.sticker !== 'orange_deco')
        );
        if (p.backMarks.length < before && target.roleId === 'chefao' || p.backMarks.length < before && target.roleId === 'mafioso') {
          room.mafiaSealUsedThisRound = Math.max(0, room.mafiaSealUsedThisRound - 1);
        }
      }
      target.urnQueuedSlip = null;
      target.urnQueuedTargetId = null;

      addPrivateNote(
        target,
        room.round,
        'Você foi bloqueado nesta rodada! Até a próxima Badalada seus poderes e fichas não funcionam.'
      );
      sendToWs(ws, { type: 'TOAST', message: `${target.name} foi bloqueado até a próxima Badalada.` });
      broadcastRoom(room);
      return;
    }

    case 'JAIL_PLAYER': {
      if (room.phase !== 'CACADA' || !player.alive || player.roleId !== 'carcereiro') return;
      if (player.blockedThisRound || player.usedRoundAction) {
        sendToWs(ws, { type: 'ERROR', message: 'Você já prendeu alguém ou está bloqueado nesta rodada.' });
        return;
      }
      const target = room.players.find((t) => t.id === msg.targetId && t.alive);
      if (!target || target.id === player.id) return;

      player.usedRoundAction = true;
      room.jailedPlayerId = target.id;
      room.jailorPlayerId = player.id;
      target.jailedThisRound = true;
      target.blockedThisRound = true;
      target.urnQueuedSlip = null;
      target.urnQueuedTargetId = null;

      for (const p of room.players) {
        const removedRed = p.backMarks.filter(
          (m) => m.placedBy === target.id && m.roundPlaced === room.round && m.sticker === 'red_seal'
        ).length;
        if (removedRed > 0) {
          room.mafiaSealUsedThisRound = Math.max(0, room.mafiaSealUsedThisRound - removedRed);
        }
        p.backMarks = p.backMarks.filter(
          (m) => !(m.placedBy === target.id && m.roundPlaced === room.round && m.sticker !== 'orange_deco')
        );
      }

      addPrivateNote(
        target,
        room.round,
        'Você foi levado à Masmorra pelo Carcereiro! Seus poderes estão bloqueados até a Badalada.'
      );
      sendToWs(ws, { type: 'TOAST', message: `${target.name} está na Masmorra. Canal de interrogatório aberto.` });
      broadcastRoom(room);
      return;
    }

    case 'QUEUE_EXECUTION': {
      if (room.phase !== 'CACADA' || !player.alive || player.roleId !== 'carcereiro') return;
      if (player.blockedThisRound || !room.jailedPlayerId || (player.slips.execution || 0) <= 0) return;
      if (player.urnQueuedSlip === 'execution') {
        player.urnQueuedSlip = null;
        player.urnQueuedTargetId = null;
        sendToWs(ws, { type: 'TOAST', message: 'Execução cancelada.' });
      } else {
        player.urnQueuedSlip = 'execution';
        player.urnQueuedTargetId = room.jailedPlayerId;
        sendToWs(ws, { type: 'TOAST', message: 'Ficha EXECUÇÃO preparada para a Urna da Badalada.' });
      }
      broadcastRoom(room);
      return;
    }

    case 'QUEUE_BULLET': {
      if (room.phase !== 'CACADA' || !player.alive || player.roleId !== 'justiceiro') return;
      if (player.blockedThisRound || (player.slips.bullet || 0) <= 0) return;
      const target = room.players.find((t) => t.id === msg.targetId && t.alive);
      if (!target || target.id === player.id) return;
      player.urnQueuedSlip = 'bullet';
      player.urnQueuedTargetId = target.id;
      sendToWs(ws, { type: 'TOAST', message: `BALA preparada contra ${target.name} para a Urna.` });
      broadcastRoom(room);
      return;
    }

    case 'SILENCE_PLAYER': {
      if (room.phase !== 'CACADA' || !player.alive || player.roleId !== 'chantagista') return;
      if (player.blockedThisRound || player.usedRoundAction || (player.slips.silence || 0) <= 0) return;
      const target = room.players.find((t) => t.id === msg.targetId && t.alive);
      if (!target || target.id === player.id) return;
      player.usedRoundAction = true;
      player.urnQueuedSlip = 'silence';
      player.urnQueuedTargetId = target.id;
      sendToWs(ws, { type: 'TOAST', message: `CALE-SE preparado para ${target.name} na Badalada.` });
      broadcastRoom(room);
      return;
    }

    case 'REVIVE_GHOST': {
      if (room.phase !== 'CACADA' || !player.alive || player.roleId !== 'retribucionista') return;
      if (player.blockedThisRound || player.usedOncePerGame) return;
      const target = room.players.find((t) => t.id === msg.targetId && !t.alive);
      if (!target) return;
      player.usedOncePerGame = true;
      player.usedRoundAction = true;
      room.pendingReviveTargetId = target.id;
      room.pendingReviveCasterId = player.id;
      sendToWs(ws, { type: 'TOAST', message: `${target.name} foi escolhido para a Retribuição na Badalada.` });
      broadcastRoom(room);
      return;
    }

    case 'REVEAL_PUBLIC_ROLE': {
      if (!player.alive || player.blockedThisRound) return;
      if (room.phase !== 'CACADA' && room.phase !== 'TRIBUNAL') return;
      if (player.roleId !== 'prefeito' && player.roleId !== 'marechal') return;
      if (player.revealedPublicly) return;

      player.revealedPublicly = true;
      if (player.roleId === 'marechal') {
        if (player.usedOncePerGame) return;
        player.usedOncePerGame = true;
        room.marshalDoubleElimination = true;
        addChronicle(
          room,
          `REVELAÇÃO! ${player.name} revelou ser o MARECHAL! Os 2 mais apontados no próximo Tribunal serão presos.`,
          'reveal'
        );
      } else {
        addChronicle(
          room,
          `REVELAÇÃO! ${player.name} revelou ser o PREFEITO! Seu voto agora vale TRIPLO (3x).`,
          'reveal'
        );
      }
      broadcastSound(room, 'tribunal');
      broadcastRoom(room);
      return;
    }

    case 'CHALLENGE_DUEL': {
      if (room.phase !== 'CACADA' || !player.alive || player.roleId !== 'pirata') return;
      if (player.blockedThisRound || player.usedRoundAction || room.activeDuel) return;
      const target = room.players.find((t) => t.id === msg.targetId && t.alive);
      if (!target || target.id === player.id) return;

      player.usedRoundAction = true;
      room.activeDuel = {
        id: uid('duel'),
        pirateId: player.id,
        targetId: target.id,
        pirateName: player.name,
        targetName: target.name,
        roundNumber: 1,
        pirateScore: 0,
        targetScore: 0,
        piratePick: null,
        targetPick: null,
        lastRoundSummary: null,
        winnerId: null,
        finished: false,
      };
      broadcastSound(room, 'duel');
      broadcastRoom(room);
      return;
    }

    case 'DUEL_PICK': {
      const duel = room.activeDuel;
      if (!duel || duel.id !== msg.duelId || duel.finished) return;
      if (player.id === duel.pirateId) {
        duel.piratePick = msg.pick;
      } else if (player.id === duel.targetId) {
        duel.targetPick = msg.pick;
      } else {
        return;
      }

      if (duel.piratePick && duel.targetPick) {
        const p1 = duel.piratePick;
        const p2 = duel.targetPick;
        let roundMsg = '';
        if (p1 === p2) {
          roundMsg = `Empate (${p1} vs ${p2})! Repetindo jogada.`;
        } else if (
          (p1 === 'pedra' && p2 === 'tesoura') ||
          (p1 === 'papel' && p2 === 'pedra') ||
          (p1 === 'tesoura' && p2 === 'papel')
        ) {
          duel.pirateScore += 1;
          roundMsg = `Pirata venceu a queda (${p1} vence ${p2})!`;
          duel.roundNumber += 1;
        } else {
          duel.targetScore += 1;
          roundMsg = `${duel.targetName} venceu a queda (${p2} vence ${p1})!`;
          duel.roundNumber += 1;
        }

        duel.lastRoundSummary = roundMsg;
        duel.piratePick = null;
        duel.targetPick = null;

        if (duel.pirateScore >= 2 || duel.targetScore >= 2) {
          duel.finished = true;
          duel.winnerId = duel.pirateScore >= 2 ? duel.pirateId : duel.targetId;
          const pirate = room.players.find((p) => p.id === duel.pirateId);
          if (duel.winnerId === duel.pirateId && pirate) {
            pirate.pirateWins += 1;
            addPrivateNote(
              pirate,
              room.round,
              `Você venceu o duelo contra ${duel.targetName}! (${pirate.pirateWins}/2 vitórias)`
            );
            if (pirate.pirateWins >= 2) {
              pirate.individualWin = true;
              addChronicle(
                room,
                `PIRATA! ${pirate.name} venceu 2 duelos e conquistou a vitória individual!`,
                'win'
              );
            }
          }
          setTimeout(() => {
            if (room.activeDuel && room.activeDuel.id === duel.id) {
              room.activeDuel = null;
              broadcastRoom(room);
            }
          }, 4000);
        }
      }
      broadcastRoom(room);
      return;
    }

    case 'URN_SUBMIT': {
      if (room.phase !== 'BADALADA' || !player.alive) return;
      if (msg.slip !== 'blank' && !player.blockedThisRound) {
        if (msg.slip === 'match' && player.roleId === 'incendiario' && (player.slips.match || 0) > 0) {
          player.urnQueuedSlip = 'match';
          player.urnQueuedTargetId = null;
        } else if (
          msg.slip === 'bullet' &&
          player.roleId === 'justiceiro' &&
          (player.slips.bullet || 0) > 0 &&
          msg.targetId
        ) {
          player.urnQueuedSlip = 'bullet';
          player.urnQueuedTargetId = msg.targetId;
        } else if (
          msg.slip === 'execution' &&
          player.roleId === 'carcereiro' &&
          (player.slips.execution || 0) > 0 &&
          room.jailedPlayerId
        ) {
          player.urnQueuedSlip = 'execution';
          player.urnQueuedTargetId = room.jailedPlayerId;
        }
      } else if (msg.slip === 'blank') {
        if (player.urnQueuedSlip === null) {
          player.urnQueuedSlip = 'blank';
        }
      }

      player.urnSubmitted = true;
      const living = room.players.filter((p) => p.alive);
      if (living.every((p) => p.urnSubmitted)) {
        resolveDancaDosSelos(room);
      } else {
        broadcastRoom(room);
      }
      return;
    }

    case 'ACTIVATE_VEST': {
      if (room.phase !== 'BADALADA' && room.phase !== 'CACADA') return;
      if (!player.alive || player.roleId !== 'sobrevivente' || player.blockedThisRound) return;
      if ((player.slips.vest || 0) <= 0) return;
      player.vestActivated = !player.vestActivated;
      sendToWs(ws, {
        type: 'TOAST',
        message: player.vestActivated
          ? 'COLETE ativado para a próxima Dança dos Selos.'
          : 'COLETE guardado.',
      });
      broadcastRoom(room);
      return;
    }

    case 'CAST_VOTE': {
      if (room.phase !== 'TRIBUNAL' || !player.alive) return;
      if (room.votes[player.id] === msg.targetId) {
        delete room.votes[player.id];
      } else {
        room.votes[player.id] = msg.targetId;
      }
      const living = room.players.filter((p) => p.alive);
      if (living.every((p) => Boolean(room.votes[p.id]))) {
        resolveTribunalVotes(room);
      } else {
        broadcastRoom(room);
      }
      return;
    }

    case 'JESTER_REVENGE': {
      if (!room.pendingJesterId || player.id !== room.pendingJesterId) return;
      if (!room.pendingJesterVoterIds.includes(msg.targetId)) return;
      const victim = room.players.find((p) => p.id === msg.targetId && p.alive);
      if (victim) {
        victim.alive = false;
        victim.deathCause = 'VINGANCA_BOBO';
        addChronicle(
          room,
          `VINGANÇA DO BOBO! ${player.name} arrastou ${victim.name} para os fantasmas!`,
          'death'
        );
        convertDependentRoleToGuest(room, victim.id, 'non_tribunal');
      }
      clearPhaseTimer(room);
      room.pendingJesterId = null;
      room.pendingJesterVoterIds = [];
      if (!checkVictoryConditions(room)) {
        startCacadaPhase(room);
      }
      return;
    }

    case 'GHOST_WHISPER': {
      if (player.alive || player.usedGhostWhisper) return;
      const target = room.players.find((t) => t.id === msg.targetId && t.alive);
      const cleanText = msg.message.trim().slice(0, 140);
      if (!target || !cleanText) return;

      player.usedGhostWhisper = true;
      addPrivateNote(
        target,
        room.round,
        `Sussurro do Além (${player.name}): "${cleanText}"`
      );
      addPrivateNote(
        player,
        room.round,
        `Você enviou seu Sussurro do Além para ${target.name}: "${cleanText}"`
      );
      sendToWs(target.ws, { type: 'TOAST', message: `Você recebeu um Sussurro do Além de ${player.name}!` });
      sendToWs(ws, { type: 'TOAST', message: `Sussurro enviado para ${target.name}.` });
      broadcastRoom(room);
      return;
    }

    case 'REVEAL_MEDIUM_TO_GHOSTS': {
      if (player.roleId !== 'medium' || !player.alive) return;
      player.mediumRevealedIdentity = true;
      room.mediumChat.push({
        id: uid('msg'),
        channel: 'MEDIUM',
        senderId: player.id,
        senderAlias: 'Sistema',
        text: `O Médium revelou sua identidade aos fantasmas: é ${player.name}!`,
        timestamp: Date.now(),
      });
      broadcastRoom(room);
      return;
    }

    case 'SEND_CHAT': {
      const text = msg.text.trim().slice(0, 220);
      if (!text) return;

      if (msg.channel === 'TRIBUNAL') {
        if (!player.alive || player.silenced) return;
        room.tribunalChat.push({
          id: uid('msg'),
          channel: 'TRIBUNAL',
          senderId: player.id,
          senderAlias: player.name,
          text,
          timestamp: Date.now(),
        });
      } else if (msg.channel === 'MAFIA') {
        if (!player.roleId || ROLES[player.roleId].faction !== 'MAFIA') return;
        room.mafiaChat.push({
          id: uid('msg'),
          channel: 'MAFIA',
          senderId: player.id,
          senderAlias: `${player.name} (${ROLES[player.roleId].name})`,
          text,
          timestamp: Date.now(),
        });
      } else if (msg.channel === 'MEDIUM') {
        if (player.alive && player.roleId !== 'medium') return;
        const alias =
          player.roleId === 'medium'
            ? player.mediumRevealedIdentity
              ? `Médium (${player.name})`
              : 'O Médium'
            : `${player.name} (Fantasma)`;
        room.mediumChat.push({
          id: uid('msg'),
          channel: 'MEDIUM',
          senderId: player.id,
          senderAlias: alias,
          text,
          timestamp: Date.now(),
        });
      } else if (msg.channel === 'GHOSTS') {
        if (player.alive) return;
        room.ghostChat.push({
          id: uid('msg'),
          channel: 'GHOSTS',
          senderId: player.id,
          senderAlias: player.name,
          text,
          timestamp: Date.now(),
        });
      } else if (msg.channel === 'DUNGEON') {
        if (player.id !== room.jailorPlayerId && player.id !== room.jailedPlayerId) return;
        const alias =
          player.id === room.jailorPlayerId
            ? 'Carcereiro'
            : `Prisioneiro (${player.name})`;
        room.dungeonChat.push({
          id: uid('msg'),
          channel: 'DUNGEON',
          senderId: player.id,
          senderAlias: alias,
          text,
          timestamp: Date.now(),
        });
      }

      broadcastRoom(room);
      return;
    }

    case 'PLAY_AGAIN': {
      if (!player.isHost) return;
      clearPhaseTimer(room);
      room.phase = 'LOBBY';
      room.round = 0;
      room.votes = {};
      room.pendingJesterId = null;
      room.pendingJesterVoterIds = [];
      room.activeDuel = null;
      room.jailedPlayerId = null;
      room.jailorPlayerId = null;
      room.chronicle = [];
      room.lastBellAnnouncements = [];
      room.winningFactions = [];
      room.winnerPlayerIds = [];
      room.winHeadline = null;
      for (const p of room.players) {
        p.alive = true;
        p.deathCause = null;
        p.revealedPublicly = false;
        p.roleId = null;
        p.originalRoleId = null;
        p.backMarks = [];
        p.secretNotes = [];
        p.silenced = false;
        p.readyForNext = false;
        p.individualWin = false;
      }
      room.publicRoleList = computeDeckPreview(room);
      broadcastRoom(room);
      return;
    }
  }
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', rooms: rooms.size });
  });

  wss.on('connection', (ws) => {
    const clientContext: { roomCode: string | null; playerId: string | null } = {
      roomCode: null,
      playerId: null,
    };

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientActionMessage;
        handleClientAction(ws, msg, clientContext);
      } catch {
        sendToWs(ws, { type: 'ERROR', message: 'Mensagem inválida.' });
      }
    });

    ws.on('close', () => {
      if (clientContext.roomCode && clientContext.playerId) {
        const room = rooms.get(clientContext.roomCode);
        if (room) {
          const p = room.players.find((x) => x.id === clientContext.playerId);
          if (p && p.ws === ws) {
            p.connected = false;
            p.ws = null;
            broadcastRoom(room);
          }
        }
      }
    });
  });

  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.join(__dirname, 'dist'));
  if (isProd) {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT) || 3000;
  server.listen(port, '0.0.0.0', () => {
    console.log(`A Noite das Marcas server running on http://0.0.0.0:${port}`);
  });
}

startServer();
