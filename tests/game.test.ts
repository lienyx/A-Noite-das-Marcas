import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { PgDialect } from 'drizzle-orm/pg-core';
import { WebSocket } from 'ws';
import { generateClassicDeck, generateCategoriesDeck, ROLES } from '../src/shared/gameData.ts';
import type { RoomSyncPayload, ServerMessage, ClientActionMessage } from '../src/shared/types.ts';

// This adapter exercises the real WebSocket protocol and durable-snapshot boundary
// without changing the project's deployment database during automated tests.
const snapshots = new Map<string, any>();
let failNextSave = false;
const dialect = new PgDialect();
function assertDatabaseText(value: unknown): void {
  if (typeof value === 'string') {
    for (const character of value) {
      const point = character.codePointAt(0)!;
      if (point === 0 || (point >= 0xd800 && point <= 0xdfff)) {
        throw new Error('Postgres rejected invalid Unicode in JSONB');
      }
    }
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) assertDatabaseText(child);
  }
}
mock.module(new URL('../db/index.ts', import.meta.url).href, { namedExports: { db: {
  async transaction(callback: (tx: any) => Promise<void>) {
    const before = structuredClone(snapshots);
    try {
      return await callback({
        execute: async () => {},
        select: () => ({ from: () => ({ where: async (condition: any) => {
          const code = dialect.sqlToQuery(condition).params[0] as string;
          return snapshots.has(code) ? [structuredClone(snapshots.get(code))] : [];
        } }) }),
        insert: () => ({ values: (record: any) => ({ onConflictDoUpdate: async () => {
          if (failNextSave) { failNextSave = false; throw new Error('Simulated write failure'); }
          assertDatabaseText(record.state);
          snapshots.set(record.code, structuredClone(record));
        } }) }),
      });
    } catch (error) { snapshots.clear(); for (const [key, value] of before) snapshots.set(key, value); throw error; }
  },
} } });
const { createGameServer } = await import('../server.ts');

class Player {
  ws!: WebSocket;
  state: RoomSyncPayload | null = null;
  messages: ServerMessage[] = [];
  token = randomUUID();
  constructor(public name: string) {}
  async connect(port: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ws.on('message', data => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      this.messages.push(message);
      if (message.type === 'SYNC') this.state = message.payload;
    });
    await once(this.ws, 'open');
  }
  send(action: ClientActionMessage) { this.ws.send(JSON.stringify(action)); }
  async waitFor(check: () => boolean) {
    const end = Date.now() + 2500;
    while (!check()) { if (Date.now() > end) throw new Error(`Timed out for ${this.name}`); await new Promise(resolve => setTimeout(resolve, 10)); }
  }
  async close() { if (!this.ws || this.ws.readyState === WebSocket.CLOSED) return; const done = once(this.ws, 'close'); this.ws.close(); await done; }
}

test('baralhos possuem uma carta válida por participante', () => {
  for (let count = 4; count <= 20; count++) {
    for (let sample = 0; sample < 20; sample++) {
      for (const deck of [generateClassicDeck(count), generateCategoriesDeck(count)]) {
        assert.equal(deck.length, count);
        assert.ok(deck.every(role => ROLES[role]));
        assert.ok(deck.some(role => ROLES[role].faction === 'CIDADE'));
        assert.ok(deck.some(role => ROLES[role].faction === 'MAFIA'));
      }
    }
  }
});

test('partida multiplayer: configurações, sigilo, duelo, reconexão, votos e saída', async t => {
  const server = await createGameServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const players = ['Beatriz', 'Caio', 'Helena', 'Vicente'].map(name => new Player(name));
  t.after(async () => { await Promise.all(players.map(player => player.close())); server.close(); });
  const [host] = players;
  await host.connect(port);
  host.send({ type: 'CREATE_ROOM', name: host.name, playerToken: host.token });
  await host.waitFor(() => Boolean(host.state));
  const code = host.state!.publicState.roomCode;
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}$/);
  for (const player of players.slice(1)) {
    await player.connect(port);
    player.send({ type: 'JOIN_ROOM', roomCode: code, name: player.name, playerToken: player.token });
    await player.waitFor(() => Boolean(player.state));
  }
  await host.waitFor(() => host.state!.publicState.players.length === 4);
  assert.equal(snapshots.get(code).state.players.length, 4);
  assert.notEqual(snapshots.get(code).state.players[0].token, host.token);
  assert.equal(snapshots.get(code).state.players[0].ws, null);

  await t.test('convidado não altera opções do anfitrião e entradas inválidas não quebram o servidor', async () => {
    players[1].send({ type: 'UPDATE_SETTINGS', cacadaMinutes: 30 });
    host.send({ type: 'SYNC_REQUEST' });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(host.state!.publicState.cacadaMinutes, 5);
    host.ws.send(JSON.stringify({ type: 'CREATE_ROOM', name: null }));
    await host.waitFor(() => host.messages.some(message => message.type === 'ERROR'));
  });

  host.send({ type: 'UPDATE_SETTINGS', deckMode: 'free', customDeck: ['chefao', 'pirata', 'doutor', 'xerife'], cacadaMinutes: 0, tribunalMinutes: 0 });
  await host.waitFor(() => host.state!.publicState.deckMode === 'free');
  host.send({ type: 'START_GAME' });
  await host.waitFor(() => host.state!.publicState.phase === 'NOITE_ZERO');
  await Promise.all(players.map(player => player.waitFor(() => player.state!.privateState.roleId !== null)));
  for (const player of players) assert.ok(player.state!.publicState.players.every(p => p.revealedRole === null));
  host.send({ type: 'ADVANCE_PHASE' });
  await host.waitFor(() => host.state!.publicState.phase === 'CACADA');
  const mafia = players.find(player => player.state!.privateState.roleId === 'chefao')!;
  const pirate = players.find(player => player.state!.privateState.roleId === 'pirata')!;
  const doctor = players.find(player => player.state!.privateState.roleId === 'doutor')!;
  const target = players.find(player => player.state!.privateState.roleId === 'xerife')!;
  const targetId = target.state!.privateState.playerId;

  await t.test('selos ficam ocultos do alvo e a proteção impede a morte', async () => {
    mafia.send({ type: 'APPLY_STICKER', sticker: 'red_seal', targetId });
    await mafia.waitFor(() => mafia.state!.privateState.mafiaSealUsedThisRound === 1);
    assert.deepEqual(target.state!.publicState.players.find(p => p.id === targetId)!.backMarks, []);
    doctor.send({ type: 'APPLY_STICKER', sticker: 'white_amulet', targetId });
    await doctor.waitFor(() => doctor.state!.privateState.usedRoundAction);
  });

  await t.test('duelo não revela a escolha ao adversário nem aos demais', async () => {
    pirate.send({ type: 'CHALLENGE_DUEL', targetId });
    await pirate.waitFor(() => Boolean(pirate.state!.publicState.activeDuel));
    const duelId = pirate.state!.publicState.activeDuel!.id;
    pirate.send({ type: 'DUEL_PICK', duelId, pick: 'pedra' });
    await pirate.waitFor(() => pirate.state!.publicState.activeDuel!.piratePick === 'pedra');
    await target.waitFor(() => Boolean(target.state!.publicState.activeDuel));
    assert.equal(target.state!.publicState.activeDuel!.piratePick, null);
    for (const spectator of players.filter(p => p !== pirate && p !== target)) assert.equal(spectator.state!.publicState.activeDuel, null);
    target.send({ type: 'DUEL_PICK', duelId, pick: 'tesoura' });
    await pirate.waitFor(() => pirate.state!.publicState.activeDuel!.pirateScore === 1);
    pirate.send({ type: 'DUEL_PICK', duelId, pick: 'pedra' });
    target.send({ type: 'DUEL_PICK', duelId, pick: 'tesoura' });
    await pirate.waitFor(() => Boolean(pirate.state!.publicState.activeDuel?.finished));
    const syncCount = doctor.messages.filter(message => message.type === 'SYNC').length;
    doctor.send({ type: 'SYNC_REQUEST' });
    await doctor.waitFor(() => doctor.messages.filter(message => message.type === 'SYNC').length > syncCount);
    assert.equal(snapshots.get(code).state.activeDuel?.finished, true, 'Uma consulta de estado não deve apagar o resultado do duelo');
    snapshots.get(code).state.activeDuel.finishedAt = Date.now() - 4001;
    const pirateSyncCount = pirate.messages.filter(message => message.type === 'SYNC').length;
    pirate.send({ type: 'SYNC_REQUEST' });
    await pirate.waitFor(() => pirate.messages.filter(message => message.type === 'SYNC').length > pirateSyncCount);
    assert.equal(pirate.state!.publicState.activeDuel, null, 'O prazo persistido deve encerrar a exibição do resultado');
  });

  await t.test('reconexão retoma a mesma identidade e papel', async () => {
    const id = target.state!.privateState.playerId;
    await target.close();
    target.state = null;
    await target.connect(port);
    target.send({ type: 'JOIN_ROOM', roomCode: code, name: target.name, playerToken: target.token });
    await target.waitFor(() => Boolean(target.state));
    assert.equal(target.state!.privateState.playerId, id);
    assert.equal(target.state!.privateState.roleId, 'xerife');
    assert.equal(target.state!.publicState.players.length, 4);
  });

  host.send({ type: 'ADVANCE_PHASE' });
  await host.waitFor(() => host.state!.publicState.phase === 'BADALADA');
  await t.test('uma ficha inválida não consome o depósito na urna', async () => {
    const before = host.messages.length;
    host.ws.send(JSON.stringify({ type: 'URN_SUBMIT', slip: 'ficha_inexistente' }));
    await host.waitFor(() => host.messages.slice(before).some(message => message.type === 'ERROR' && message.message === 'Mensagem inválida.'));
    assert.equal(snapshots.get(code).state.players.find((p: any) => p.id === host.state!.privateState.playerId).urnSubmitted, false);
  });
  for (const player of players) player.send({ type: 'URN_SUBMIT', slip: 'blank' });
  await host.waitFor(() => host.state!.publicState.phase === 'DANCA_DOS_SELOS');
  assert.ok(host.state!.publicState.players.every(player => player.alive));
  assert.ok(host.state!.publicState.lastBellAnnouncements.some(message => message.includes('Amuleto')));
  host.send({ type: 'ADVANCE_PHASE' });
  await host.waitFor(() => host.state!.publicState.phase === 'TRIBUNAL');
  const mafiaId = mafia.state!.privateState.playerId;
  for (const player of players) player.send({ type: 'CAST_VOTE', targetId: player === mafia ? 'SKIP' : mafiaId });
  await host.waitFor(() => host.state!.publicState.phase === 'FIM_DE_JOGO');
  assert.deepEqual(host.state!.publicState.winningFactions, ['CIDADE']);
  assert.ok(host.state!.publicState.players.every(p => p.revealedRole !== null));

  host.send({ type: 'PLAY_AGAIN' });
  await Promise.all(players.map(player => player.waitFor(() => player.state!.publicState.phase === 'LOBBY')));
  await t.test('uma nova partida limpa inventários, missões e poderes da anterior', () => {
    for (const player of players) {
      const state = player.state!.privateState;
      assert.equal(state.roleId, null);
      assert.deepEqual(state.stickers, {});
      assert.deepEqual(state.slips, {});
      assert.equal(state.secretMission, null);
      assert.equal(state.usedRoundAction, false);
      assert.equal(state.urnSubmitted, false);
    }
    assert.equal(host.state!.publicState.marshalDoubleElimination, false);
  });
  host.send({ type: 'LEAVE_ROOM' });
  await host.waitFor(() => host.messages.some(message => message.type === 'LEFT'));
  await players[1].waitFor(() => players[1].state!.publicState.players.length === 3);
  assert.equal(players[1].state!.publicState.players.filter(p => p.isHost).length, 1);
});

test('pedidos simultâneos de criação mantêm a conexão em uma única sala', async t => {
  const server = await createGameServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const host = new Player('Marina');
  t.after(async () => { await host.close(); server.close(); });
  await host.connect(port);
  const before = snapshots.size;
  host.send({ type: 'CREATE_ROOM', name: host.name, playerToken: host.token });
  host.send({ type: 'CREATE_ROOM', name: host.name, playerToken: host.token });
  await host.waitFor(() => host.messages.filter(message => message.type === 'SYNC' || message.type === 'ERROR').length >= 2);
  assert.equal(snapshots.size, before + 1);
  assert.ok(host.messages.some(message => message.type === 'ERROR' && message.message.includes('Saia da sala')));
});

test('uma reconexão com falha de gravação preserva a sessão anterior', async t => {
  t.mock.method(console, 'error', () => {});
  const server = await createGameServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const host = new Player('Cecília');
  const replacement = new Player(host.name);
  replacement.token = host.token;
  t.after(async () => { failNextSave = false; await Promise.all([host.close(), replacement.close()]); server.close(); });
  await host.connect(port);
  host.send({ type: 'CREATE_ROOM', name: host.name, playerToken: host.token });
  await host.waitFor(() => Boolean(host.state));
  const code = host.state!.publicState.roomCode;
  await replacement.connect(port);
  failNextSave = true;
  replacement.send({ type: 'JOIN_ROOM', roomCode: code, name: replacement.name, playerToken: replacement.token });
  await replacement.waitFor(() => replacement.messages.some(message => message.type === 'ERROR'));
  assert.equal(replacement.state, null, 'A reconexão só pode ser confirmada após a gravação');
  assert.equal(host.ws.readyState, WebSocket.OPEN, 'A sessão anterior deve continuar disponível');
  const syncCount = host.messages.filter(message => message.type === 'SYNC').length;
  host.send({ type: 'SYNC_REQUEST' });
  await host.waitFor(() => host.messages.filter(message => message.type === 'SYNC').length > syncCount);
  replacement.send({ type: 'JOIN_ROOM', roomCode: code, name: replacement.name, playerToken: replacement.token });
  await replacement.waitFor(() => Boolean(replacement.state));
  assert.equal(replacement.state!.privateState.playerId, host.state!.privateState.playerId);
  await host.waitFor(() => host.ws.readyState === WebSocket.CLOSED);
  assert.equal(replacement.state!.publicState.players.length, 1);
});

test('mensagens malformadas e origens inválidas não interrompem a sala', async t => {
  const server = await createGameServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const host = new Player('Rafael');
  const guest = new Player('Lívia');
  t.after(async () => { await Promise.all([host.close(), guest.close()]); server.close(); });
  await host.connect(port);
  host.send({ type: 'CREATE_ROOM', name: host.name, playerToken: host.token });
  await host.waitFor(() => Boolean(host.state));
  const code = host.state!.publicState.roomCode;

  const invalid = [
    { type: 'ACAO_INEXISTENTE' },
    { type: 'SEND_CHAT', text: 'teste', channel: 'CANAL_INEXISTENTE' },
    { type: 'REORDER_SEAT', playerId: host.state!.privateState.playerId, direction: 'lado' },
    { type: 'UPDATE_SETTINGS', deckMode: 'free', customDeck: ['papel_inexistente'] },
    { type: 'UPDATE_SETTINGS', deckMode: 'free', customDeck: ['__proto__'] },
    { type: 'UPDATE_SETTINGS', cacadaMinutes: '5' },
    { type: 'APPLY_STICKER', targetId: null, sticker: 'red_seal' },
    { type: 'GHOST_WHISPER', message: {} },
    { type: 'CAST_VOTE' },
    { type: 'URN_SUBMIT', slip: 'vest' },
  ];
  const before = host.messages.length;
  for (const message of invalid) host.ws.send(JSON.stringify(message));
  await host.waitFor(() => host.messages.slice(before).filter(message => message.type === 'ERROR').length >= invalid.length);
  assert.ok(host.messages.slice(before).filter(message => message.type === 'ERROR').every(message => message.message === 'Mensagem inválida.'));
  assert.equal(snapshots.get(code).state.deckMode, 'classic');

  const invalidOrigin = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: 'invalid-origin' });
  const [closeCode] = await once(invalidOrigin, 'close');
  assert.equal(closeCode, 1008);
  await guest.connect(port);
  guest.send({ type: 'JOIN_ROOM', roomCode: ` ${code.toLowerCase()} `, name: guest.name, playerToken: guest.token });
  await guest.waitFor(() => Boolean(guest.state));
  assert.equal(guest.state!.publicState.roomCode, code);
  assert.equal(guest.state!.publicState.players.length, 2);
});

test('uma sala vazia recupera papéis e avança o prazo vencido ao reconectar', async t => {
  const server = await createGameServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const players = ['Clarice', 'Tomás', 'Inês', 'Joaquim'].map(name => new Player(name));
  t.after(async () => { await Promise.all(players.map(player => player.close())); server.close(); });
  const [host] = players;
  await host.connect(port);
  host.send({ type: 'CREATE_ROOM', name: host.name, playerToken: host.token });
  await host.waitFor(() => Boolean(host.state));
  const code = host.state!.publicState.roomCode;
  for (const player of players.slice(1)) {
    await player.connect(port);
    player.send({ type: 'JOIN_ROOM', roomCode: code, name: player.name, playerToken: player.token });
    await player.waitFor(() => Boolean(player.state));
  }
  host.send({ type: 'START_GAME' });
  await Promise.all(players.map(player => player.waitFor(() => player.state!.publicState.phase === 'NOITE_ZERO')));
  const identities = players.map(player => ({ id: player.state!.privateState.playerId, role: player.state!.privateState.roleId }));
  await Promise.all(players.map(player => player.close()));
  await host.waitFor(() => snapshots.get(code).state.players.every((player: any) => !player.connected));
  snapshots.get(code).state.phaseEndsAt = Date.now() - 1;
  for (const [index, player] of players.entries()) {
    player.state = null;
    await player.connect(port);
    player.send({ type: 'JOIN_ROOM', roomCode: code, name: player.name, playerToken: player.token });
    await player.waitFor(() => Boolean(player.state));
    assert.equal(player.state!.privateState.playerId, identities[index].id);
    assert.equal(player.state!.privateState.roleId, identities[index].role);
    assert.equal(player.state!.publicState.phase, 'CACADA');
    assert.equal(player.state!.publicState.round, 1);
    assert.equal(player.state!.publicState.players.length, 4);
  }
});

test('nomes, conversas e sussurros preservam Unicode válido ao salvar a partida', async t => {
  const server = await createGameServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const longName = 'a'.repeat(19) + '🌙';
  const players = ['Jo\u0000ão 🌙 \ud800', longName, `${longName}\u0000`, 'Álvaro \udc00'].map(name => new Player(name));
  t.after(async () => { await Promise.all(players.map(player => player.close())); server.close(); });
  const [host, guest] = players;
  await host.connect(port);
  host.send({ type: 'CREATE_ROOM', name: host.name, playerToken: host.token });
  await host.waitFor(() => Boolean(host.state) || host.messages.some(message => message.type === 'ERROR'));
  assert.ok(host.state, 'Um nome com Unicode inválido deve ser limpo antes de chegar ao banco');
  const code = host.state.publicState.roomCode;
  for (const player of players.slice(1)) {
    await player.connect(port);
    player.send({ type: 'JOIN_ROOM', roomCode: code, name: player.name, playerToken: player.token });
    await player.waitFor(() => Boolean(player.state));
  }
  await host.waitFor(() => host.state!.publicState.players.length === 4);
  assert.deepEqual(host.state.publicState.players.map(player => player.name), [
    'João 🌙 �', longName, `${'a'.repeat(19)} 3`, 'Álvaro �',
  ]);

  await guest.close();
  guest.state = null;
  await guest.connect(port);
  guest.send({ type: 'JOIN_ROOM', roomCode: code, name: 'Inês\u0000 🌙\ud800', playerToken: guest.token });
  await guest.waitFor(() => Boolean(guest.state));
  assert.equal(guest.state!.publicState.players.find(player => player.id === guest.state!.privateState.playerId)!.name, 'Inês 🌙�');

  host.send({ type: 'UPDATE_SETTINGS', deckMode: 'free', customDeck: ['chefao', 'convidado', 'convidado', 'convidado'], cacadaMinutes: 0, tribunalMinutes: 0 });
  await host.waitFor(() => host.state!.publicState.deckMode === 'free');
  host.send({ type: 'START_GAME' });
  await host.waitFor(() => host.state!.publicState.phase === 'NOITE_ZERO');
  for (const phase of ['CACADA', 'BADALADA', 'DANCA_DOS_SELOS', 'TRIBUNAL']) {
    host.send({ type: 'ADVANCE_PHASE' });
    await host.waitFor(() => host.state!.publicState.phase === phase);
  }

  await t.test('conversas mantêm acentos e emojis sem cortar um par Unicode', async () => {
    for (const [input, expected] of [
      ['Olá\u0000, São João 🌙 \ud800 e \udc00', 'Olá, São João 🌙 � e �'],
      ['é'.repeat(219) + '🌙', 'é'.repeat(219)],
      ['Texto literal: \\u0000', 'Texto literal: \\u0000'],
    ]) {
      const count = host.state!.privateState.tribunalChat.length;
      host.send({ type: 'SEND_CHAT', channel: 'TRIBUNAL', text: input });
      await host.waitFor(() => host.state!.privateState.tribunalChat.length > count);
      assert.equal(host.state!.privateState.tribunalChat.at(-1)!.text, expected);
    }
    const before = host.messages.length;
    host.send({ type: 'SEND_CHAT', channel: 'TRIBUNAL', text: '\u0000' });
    await host.waitFor(() => host.messages.slice(before).some(message => message.type === 'ERROR' && message.message === 'Mensagem inválida.'));
    assert.equal(host.state!.privateState.tribunalChat.length, 3);
  });

  await t.test('um sussurro mantém seu limite sem gravar meio emoji', async () => {
    const ghost = players.find(player => player.state!.privateState.roleId === 'convidado')!;
    const ghostId = ghost.state!.privateState.playerId;
    for (const player of players) player.send({ type: 'CAST_VOTE', targetId: player === ghost ? 'SKIP' : ghostId });
    await ghost.waitFor(() => ghost.state!.publicState.round === 2);
    assert.equal(ghost.state!.publicState.players.find(player => player.id === ghostId)!.alive, false);
    const target = players.find(player => player !== ghost)!;
    const targetId = target.state!.privateState.playerId;
    const before = ghost.messages.length;
    ghost.send({ type: 'GHOST_WHISPER', targetId, message: '\u0000' });
    await ghost.waitFor(() => ghost.messages.slice(before).some(message => message.type === 'ERROR' && message.message === 'Mensagem inválida.'));
    assert.equal(ghost.state!.privateState.usedGhostWhisper, false);

    const prefix = 'Ação � ';
    const suffix = 'b'.repeat(139 - prefix.length);
    ghost.send({ type: 'GHOST_WHISPER', targetId, message: `Ação \ud800\u0000 ${suffix}🌙` });
    await target.waitFor(() => target.state!.privateState.secretNotes.some(note => note.text.includes('Sussurro do Além')));
    assert.ok(target.state!.privateState.secretNotes.some(note => note.text.endsWith(`"${prefix}${suffix}"`)));
    assert.equal(snapshots.get(code).state.players.find((player: any) => player.id === ghostId).usedGhostWhisper, true);
  });
});
