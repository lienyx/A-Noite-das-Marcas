import { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Minus,
  Play,
  Plus,
  QrCode,
  Shuffle,
  SlidersHorizontal,
  Users,
  UserMinus,
} from 'lucide-react';
import {
  ALL_ROLE_IDS,
  ROLES,
  validateFreeDeck,
  type DeckMode,
  type KillerPace,
  type RoleId,
} from '../shared/gameData';
import type { ClientActionMessage, PublicGameState } from '../shared/types';
import { RoleIcon, getFactionMeta } from './RoleIcon';

export function LobbyScreen({
  publicState,
  playerId,
  onAction,
}: {
  publicState: PublicGameState;
  playerId: string;
  onAction: (action: ClientActionMessage) => void;
}) {
  const me = publicState.players.find((p) => p.id === playerId);
  const isHost = Boolean(me?.isHost);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}?room=${publicState.roomCode}`;
  }, [publicState.roomCode]);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setCopyError(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
      setShowQr(true);
    }
  };

  const roleCounts = useMemo(() => {
    const map = new Map<RoleId, number>();
    for (const r of publicState.publicRoleList) {
      map.set(r, (map.get(r) || 0) + 1);
    }
    return Array.from(map.entries());
  }, [publicState.publicRoleList]);

  const freeDeckWarnings = useMemo(() => {
    if (publicState.deckMode !== 'free') return [];
    return validateFreeDeck(publicState.publicRoleList, publicState.players.length);
  }, [publicState.deckMode, publicState.publicRoleList, publicState.players.length]);

  const adjustFreeRole = (roleId: RoleId, delta: number) => {
    const current = [...publicState.publicRoleList];
    if (delta > 0) {
      const count = current.filter((r) => r === roleId).length;
      if (count >= ROLES[roleId].maxCopies) return;
      current.push(roleId);
    } else {
      const idx = current.indexOf(roleId);
      if (idx === -1) return;
      current.splice(idx, 1);
    }
    onAction({ type: 'UPDATE_SETTINGS', customDeck: current });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-5 pb-28 sm:px-6 space-y-6">
      <section className="lobby-intro"><p className="eyebrow">A CIDADE COMEÇA A SE REUNIR</p><h1>Preparem seus álibis.</h1><p>{isHost ? 'Convide seus amigos, escolha o baralho e ajuste o ritmo da noite. Quando todos chegarem, os segredos serão distribuídos.' : 'Você já tem um lugar na cidade. Enquanto os outros chegam, conheça os papéis e prepare sua melhor história.'}</p></section>
      {/* Invite banner */}
      <section className="rounded-2xl border border-white/10 bg-[#161922] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs text-[#A8A095]">Código da Sala</p>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-3xl font-bold tracking-widest text-[#FCD34D] tabular-nums">
              {publicState.roomCode}
            </span>
            <span className="text-xs text-[#A8A095]">
              {publicState.players.filter(p => p.connected).length} de {publicState.players.length} na cidade
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyInvite}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-white/15 bg-[#0C0E14] px-4 py-2 text-xs font-semibold text-[#F1EDE4] hover:border-white/30 whitespace-nowrap"
          >
            {copied ? <Check className="w-4 h-4 text-[#6EE7B7]" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Link Copiado' : 'Copiar Link'}
          </button>
          <button
            type="button"
            onClick={() => setShowQr((s) => !s)}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#D99B26]/35 bg-[#D99B26]/10 px-4 py-2 text-xs font-semibold text-[#FCD34D] hover:bg-[#D99B26]/20 whitespace-nowrap"
          >
            <QrCode className="w-4 h-4" />
            {showQr ? 'Ocultar QR' : 'QR Code'}
          </button>
        </div>
      </section>

      {copyError && <p role="status" className="text-xs text-[#CDAE7E]">Não foi possível copiar automaticamente. Compartilhe o código acima ou use o QR Code.</p>}
      {showQr && shareUrl && (
        <section className="rounded-2xl border border-[#D99B26]/30 bg-[#161922] p-6 flex flex-col items-center gap-3 text-center">
          <div className="rounded-xl bg-white p-3">
            <QRCodeSVG value={shareUrl} size={180} />
          </div>
          <p className="text-xs text-[#D6CFC2]">
            Peça aos convidados para apontarem a câmera e entrarem direto na sala <strong className="font-mono text-[#FCD34D]">{publicState.roomCode}</strong>.
          </p>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Circle Seating Order */}
        <section className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#161922] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#D99B26]" />
              <h2 className="font-display text-base font-bold text-[#F5EBD6]">
                Quem está na cidade
              </h2>
            </div>
            {isHost && (
              <button
                type="button"
                onClick={() => onAction({ type: 'SHUFFLE_SEATS' })}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#0C0E14] px-3 py-1.5 text-xs font-medium text-[#D6CFC2] hover:text-white whitespace-nowrap"
              >
                <Shuffle className="w-3.5 h-3.5" />
                Embaralhar
              </button>
            )}
          </div>
          <p className="text-xs text-[#A8A095]">
            A ordem da lista define quem está à direita (protegido do Anjo) e à esquerda (alvo do Carrasco).
          </p>

          <div className="lobby-progress"><span>{publicState.players.length < 4 ? `Faltam ${4 - publicState.players.length} para começar` : 'A cidade está pronta para jogar'}</span><div className="lobby-progress-track"><span style={{ transform: `scaleX(${Math.min(1, publicState.players.length / 4)})` }} /></div></div>
          <ul className="divide-y divide-white/10">
            {publicState.players.map((p, index) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs text-[#8A8277] w-5 tabular-nums">
                    {index + 1}.
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#F1EDE4] truncate">
                      {p.name}
                      {p.id === playerId && (
                        <span className="ml-1.5 text-xs font-normal text-[#D99B26]">(Você)</span>
                      )}
                    </p>
                    <p className="text-[11px] text-[#8A8277]">
                      {p.isHost ? 'Organizador' : 'Convidado'} · {p.connected ? 'Conectado' : 'Reconectando'}
                    </p>
                  </div>
                </div>

                {isHost && (
                  <div className="flex items-center gap-1 shrink-0">
                    {!p.connected && <button type="button" onClick={() => onAction({ type: 'KICK_PLAYER', playerId: p.id })} aria-label={`Remover ${p.name} da sala`} title="Remover convidado desconectado" className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-white/10 text-[#CDAE7E]"><UserMinus size={15} /></button>}
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => onAction({ type: 'REORDER_SEAT', playerId: p.id, direction: 'up' })}
                      aria-label={`Mover ${p.name} para cima`}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-white/10 text-[#A8A095] hover:text-white disabled:opacity-30"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === publicState.players.length - 1}
                      onClick={() => onAction({ type: 'REORDER_SEAT', playerId: p.id, direction: 'down' })}
                      aria-label={`Mover ${p.name} para baixo`}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-white/10 text-[#A8A095] hover:text-white disabled:opacity-30"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Deck & Settings */}
        <section className="lg:col-span-7 space-y-6">
          <div className="rounded-2xl border border-white/10 bg-[#161922] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-[#D99B26]" />
              <h2 className="font-display text-base font-bold text-[#F5EBD6]">
                O ritmo da noite
              </h2>
            </div>

            {/* Deck mode selector */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#A8A095]">Modo de distribuição</label>
              <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-[#0C0E14] p-1 border border-white/10">
                {(
                  [
                    ['classic', '1. Clássico'],
                    ['categories', '2. Categorias'],
                    ['free', '3. Livre'],
                  ] as Array<[DeckMode, string]>
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    disabled={!isHost}
                    onClick={() => onAction({ type: 'UPDATE_SETTINGS', deckMode: m })}
                    className={`min-h-[42px] rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      publicState.deckMode === m
                        ? 'bg-[#D99B26] text-[#0C0E14]'
                        : 'text-[#A8A095] hover:text-white'
                    } disabled:cursor-default`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Timers & Pace */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="space-y-1.5">
                <label htmlFor="hunt-duration" className="block text-[#A8A095]">Tempo da Caçada</label>
                <select
                  disabled={!isHost}
                  id="hunt-duration"
                  value={publicState.cacadaMinutes}
                  onChange={(e) =>
                    onAction({
                      type: 'UPDATE_SETTINGS',
                      cacadaMinutes: Number(e.target.value),
                    })
                  }
                  className="w-full min-h-[44px] rounded-xl border border-white/15 bg-[#0C0E14] px-3 py-2 text-white focus:border-[#D99B26] focus:outline-none disabled:opacity-70"
                >
                  <option value={3}>3 min (Dinâmico)</option>
                  <option value={5}>5 min (Padrão App)</option>
                  <option value={10}>10 min</option>
                  <option value={15}>15 min</option>
                  <option value={30}>30 min (Festa)</option>
                  <option value={0}>Manual (Sem timer)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="trial-duration" className="block text-[#A8A095]">Tempo do Tribunal</label>
                <select
                  disabled={!isHost}
                  id="trial-duration"
                  value={publicState.tribunalMinutes}
                  onChange={(e) =>
                    onAction({
                      type: 'UPDATE_SETTINGS',
                      tribunalMinutes: Number(e.target.value),
                    })
                  }
                  className="w-full min-h-[44px] rounded-xl border border-white/15 bg-[#0C0E14] px-3 py-2 text-white focus:border-[#D99B26] focus:outline-none disabled:opacity-70"
                >
                  <option value={2}>2 min</option>
                  <option value={3}>3 min (Padrão)</option>
                  <option value={5}>5 min</option>
                  <option value={10}>10 min (Festa)</option>
                  <option value={0}>Manual (Sem timer)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[#A8A095]">Ritmo de Selos</label>
                <select
                  disabled={!isHost}
                  aria-label="Ritmo dos matadores"
                  value={publicState.killerPace}
                  onChange={(e) =>
                    onAction({
                      type: 'UPDATE_SETTINGS',
                      killerPace: e.target.value as KillerPace,
                    })
                  }
                  className="w-full min-h-[44px] rounded-xl border border-white/15 bg-[#0C0E14] px-3 py-2 text-white focus:border-[#D99B26] focus:outline-none disabled:opacity-70"
                >
                  <option value="normal">Normal (1/rodada)</option>
                  <option value="fast">Se arrastar (2 Máfia/rodada)</option>
                  <option value="slow">Rápido demais (1 a cada 2 rodadas)</option>
                </select>
              </div>
            </div>

            {isHost && (
              <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0C0E14]/60 px-3.5 py-2.5 text-xs cursor-pointer">
                <span className="text-[#D6CFC2]">
                  Ocultar marcas das costas de todos até a Badalada (modo ultra secreto)
                </span>
                <input
                  type="checkbox"
                  checked={publicState.hideBackMarksUntilBell}
                  onChange={(e) =>
                    onAction({
                      type: 'UPDATE_SETTINGS',
                      hideBackMarksUntilBell: e.target.checked,
                    })
                  }
                  className="h-5 w-5 accent-[#D99B26]"
                />
              </label>
            )}
          </div>

          {/* Public Role List */}
          <div className="rounded-2xl border border-white/10 bg-[#161922] p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-bold text-[#F5EBD6]">
                Lista Pública de Papéis ({publicState.publicRoleList.length}/{publicState.players.length})
              </h3>
              <span className="text-xs text-[#A8A095]">Visível a todos na partida</span>
            </div>

            {freeDeckWarnings.length > 0 && (
              <div className="rounded-xl border border-[#D99B26]/40 bg-[#D99B26]/10 p-3 space-y-1 text-xs text-[#FCD34D]">
                {freeDeckWarnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            )}

            {publicState.deckMode === 'free' && isHost ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                {ALL_ROLE_IDS.map((id) => {
                  const r = ROLES[id];
                  const f = getFactionMeta(r.faction);
                  const count = publicState.publicRoleList.filter((x) => x === id).length;
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#0C0E14]/60 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#F1EDE4] truncate">{r.name}</p>
                        <p className={`text-[11px] ${f.textColor}`}>{f.label}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          aria-label={`Remover ${r.name} do baralho`}
                          onClick={() => adjustFreeRole(id, -1)}
                          disabled={count === 0}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-white/10 text-[#D6CFC2] disabled:opacity-30"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-mono text-xs w-4 text-center tabular-nums">
                          {count}
                        </span>
                        <button
                          type="button"
                          aria-label={`Adicionar ${r.name} ao baralho`}
                          onClick={() => adjustFreeRole(id, 1)}
                          disabled={count >= r.maxCopies}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-white/10 text-[#D6CFC2] disabled:opacity-30"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {roleCounts.map(([roleId, count]) => {
                  const r = ROLES[roleId];
                  const f = getFactionMeta(r.faction);
                  return (
                    <div
                      key={roleId}
                      className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#0C0E14]/60 px-3 py-2"
                    >
                      <span className={`${f.textColor} shrink-0`}>
                        <RoleIcon roleId={roleId} className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#F1EDE4] truncate">
                          {r.name} {count > 1 ? `×${count}` : ''}
                        </p>
                        <p className="text-[11px] text-[#8A8277] truncate">{f.label}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Bottom Start Action */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-[#0C0E14]/95 backdrop-blur-md px-4 py-3 pb-safe">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          {isHost ? (
            <button
              type="button"
              disabled={
                publicState.players.length < 4 || publicState.players.some(p => !p.connected) ||
                publicState.publicRoleList.length !== publicState.players.length
              }
              onClick={() => onAction({ type: 'START_GAME' })}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#D99B26] px-6 py-3 text-sm font-bold text-[#0C0E14] transition-transform active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed hover:bg-[#E5AA36]"
            >
              <Play className="w-4 h-4" />
              {publicState.players.length < 4
                ? `Aguardando jogadores (${publicState.players.length}/4 mínimo)`
                : 'Sortear Pergaminhos e Iniciar Noite Zero'}
            </button>
          ) : (
            <p className="w-full text-center text-xs font-medium text-[#A8A095] py-2">
              Aguardando o organizador iniciar a partida...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
