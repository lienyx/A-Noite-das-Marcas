import { useEffect, useState } from 'react';
import { Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { ROLES, STICKER_META, type SlipType, type StickerType } from '../shared/gameData';
import type { PrivatePlayerState, PublicPlayer } from '../shared/types';
import { RoleIcon, getFactionMeta } from './RoleIcon';

const SLIP_NAMES: Record<SlipType, string> = {
  match: 'Fósforo',
  bullet: 'Bala',
  execution: 'Execução',
  silence: 'Cale-se',
  vest: 'Colete',
};

export function PergaminhoCard({
  privateState,
  me,
}: {
  privateState: PrivatePlayerState;
  me: PublicPlayer | undefined;
}) {
  const [revealed, setRevealed] = useState(false);
  const [foldMode, setFoldMode] = useState<'full' | 'appearance' | 'group'>('full');

  // Auto-hide after 18s to prevent accidental shoulder-surfing at the party
  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => setRevealed(false), 18_000);
    return () => clearTimeout(t);
  }, [revealed]);

  useEffect(() => {
    const conceal = () => { if (document.hidden) { setRevealed(false); setFoldMode('full'); } };
    document.addEventListener('visibilitychange', conceal);
    return () => document.removeEventListener('visibilitychange', conceal);
  }, []);

  const role = privateState.roleId ? ROLES[privateState.roleId] : null;
  if (!role) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#161922] p-6 text-center text-sm text-[#A8A095]">
        O seu pergaminho será entregue quando a partida iniciar.
      </div>
    );
  }

  const factionMeta = getFactionMeta(role.faction);

  const stickerEntries = (Object.entries(privateState.stickers) as Array<[StickerType, number]>)
    .filter(([, count]) => count > 0);
  const slipEntries = (Object.entries(privateState.slips) as Array<[SlipType, number]>)
    .filter(([, count]) => count > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#F5EBD6]">
            Pergaminho Secreto
          </h2>
          <p className="text-xs text-[#A8A095]">
            Mantenha oculto dos convidados ao seu lado
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRevealed((prev) => !prev)}
          className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#D99B26]/40 bg-[#D99B26]/15 px-4 py-2 text-xs font-semibold text-[#FCD34D] transition-colors hover:bg-[#D99B26]/25 whitespace-nowrap shrink-0"
        >
          {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {revealed ? 'Ocultar Papel' : 'Revelar Papel'}
        </button>
      </div>

      {!revealed ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="w-full rounded-2xl border border-[#D99B26]/25 bg-[#161922] p-8 text-center transition-transform active:scale-[0.99] cursor-pointer"
        >
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-[#C83232]/40 bg-[#C83232]/20 text-[#FCA5A5]">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <p className="font-display text-base font-bold text-[#F5EBD6]">
            Envelope Lacrado
          </p>
          <p className="mt-1 text-xs text-[#A8A095]">
            Toque aqui quando ninguém estiver olhando sua tela. Fecha sozinho após 18s.
          </p>
        </button>
      ) : (
        <div className="space-y-4">
          {/* Mode switcher for folding parchment */}
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#161922] p-1 border border-white/10">
            <button
              type="button"
              onClick={() => setFoldMode('full')}
              className={`min-h-[40px] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                foldMode === 'full'
                  ? 'bg-[#D99B26] text-[#0C0E14] font-semibold'
                  : 'text-[#A8A095] hover:text-white'
              }`}
            >
              Pergaminho
            </button>
            <button
              type="button"
              onClick={() => setFoldMode('appearance')}
              className={`min-h-[40px] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                foldMode === 'appearance'
                  ? 'bg-[#D99B26] text-[#0C0E14] font-semibold'
                  : 'text-[#A8A095] hover:text-white'
              }`}
            >
              Faixa Aparência
            </button>
            <button
              type="button"
              onClick={() => setFoldMode('group')}
              className={`min-h-[40px] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                foldMode === 'group'
                  ? 'bg-[#D99B26] text-[#0C0E14] font-semibold'
                  : 'text-[#A8A095] hover:text-white'
              }`}
            >
              Faixa Grupo
            </button>
          </div>

          <div className="parchment-surface rounded-2xl border-2 border-[#8B5C2A]/40 p-5 shadow-xl">
            {foldMode === 'full' ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3 border-b border-[#8B5C2A]/25 pb-3">
                  <div>
                    <p className="text-[11px] font-semibold tracking-wider text-[#6D4720]">
                      {role.categoryHeader}
                    </p>
                    <h3 className="font-display text-2xl font-bold text-[#261B10]">
                      {role.name}
                    </h3>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#8B5C2A]/30 bg-[#E6D5B8] text-[#5B3A18]">
                    <RoleIcon roleId={role.id} className="w-5 h-5" />
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-[#3B2A1A]">
                  {role.summary}
                </p>

                <p className="text-xs font-semibold text-[#5B3A18]">
                  Objetivo: {role.victoryText}
                </p>

                <div className="flex items-center justify-between border-t border-dashed border-[#8B5C2A]/40 pt-3 text-xs font-semibold text-[#3B2A1A]">
                  <span>Aparência: {role.appearance}</span>
                  <span>Grupo: {role.groupLabel}</span>
                </div>
              </div>
            ) : foldMode === 'appearance' ? (
              <div className="py-6 text-center space-y-2">
                <p className="text-xs font-medium text-[#6D4720]">
                  Faixa dobrada (para o Xerife)
                </p>
                <p className="font-display text-2xl font-bold text-[#261B10]">
                  APARÊNCIA: {role.appearance}
                </p>
              </div>
            ) : (
              <div className="py-6 text-center space-y-2">
                <p className="text-xs font-medium text-[#6D4720]">
                  Faixa dobrada (para o Investigador)
                </p>
                <p className="font-display text-2xl font-bold text-[#261B10]">
                  GRUPO: {role.groupLabel}
                </p>
              </div>
            )}
          </div>

          {/* Linked info: Mafia partners, Anjo / Carrasco target */}
          {privateState.mafiaPartners.length > 0 && (
            <div className="rounded-2xl border border-[#C83232]/30 bg-[#161922] p-4 space-y-2">
              <p className="text-xs font-semibold text-[#FCA5A5]">
                Parceiros da Máfia ({privateState.mafiaSealUsedThisRound}/{privateState.mafiaSealLimitThisRound} selo(s) usados nesta rodada)
              </p>
              <div className="space-y-1.5">
                {privateState.mafiaPartners.map((partner) => (
                  <div
                    key={partner.id}
                    className="flex items-center justify-between text-sm text-[#F1EDE4]"
                  >
                    <span>
                      {partner.name} · {ROLES[partner.roleId].name}
                    </span>
                    <span className="text-xs text-[#A8A095]">
                      {partner.alive ? 'Vivo' : 'Fantasma'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {privateState.linkedTargetName && (
            <div className="rounded-2xl border border-[#D99B26]/35 bg-[#161922] p-4">
              <p className="text-xs font-semibold text-[#FCD34D]">
                {role.id === 'anjo_da_guarda'
                  ? 'Seu Protegido (à sua direita)'
                  : 'Seu Alvo do Tribunal (à sua esquerda)'}
              </p>
              <p className="mt-1 text-base font-bold text-[#F5EBD6]">
                {privateState.linkedTargetName}
              </p>
            </div>
          )}

          {/* Inventory */}
          <div className="rounded-2xl border border-white/10 bg-[#161922] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[#D6CFC2]">
                Seu Envelope Digital
              </p>
              <span className={`text-xs font-medium ${factionMeta.textColor}`}>
                {me?.alive ? 'Vivo' : 'Fantasma'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {stickerEntries.map(([st, count]) => (
                <div
                  key={st}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0C0E14]/60 px-3 py-2"
                >
                  <span className="text-[#D6CFC2] truncate">{STICKER_META[st].shortLabel}</span>
                  <span className="font-mono font-semibold text-[#F5EBD6] tabular-nums">
                    {count}
                  </span>
                </div>
              ))}
              {slipEntries.map(([sl, count]) => (
                <div
                  key={sl}
                  className="flex items-center justify-between rounded-xl border border-[#D99B26]/30 bg-[#D99B26]/10 px-3 py-2"
                >
                  <span className="text-[#FCD34D] truncate">{SLIP_NAMES[sl]}</span>
                  <span className="font-mono font-semibold text-[#FCD34D] tabular-nums">
                    {count}
                  </span>
                </div>
              ))}
            </div>
            {role.id === 'pirata' && (
              <p className="text-xs text-[#FCD34D]">
                Vitórias em duelos: <span className="font-mono tabular-nums">{privateState.pirateWins}/2</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Secret investigation / event log */}
      <div className="rounded-2xl border border-white/10 bg-[#161922] p-4 space-y-2">
        <h3 className="text-xs font-semibold text-[#D6CFC2]">
          Anotações Secretas
        </h3>
        {privateState.secretNotes.length === 0 ? (
          <p className="text-xs text-[#8A8277]">
            Resultados de investigações, exames do Legista e sussurros aparecerão aqui.
          </p>
        ) : (
          <ul className="space-y-2">
            {privateState.secretNotes.map((note) => (
              <li
                key={note.id}
                className="border-b border-white/5 pb-2 last:border-0 last:pb-0 text-xs text-[#F1EDE4] leading-relaxed"
              >
                <span className="font-mono text-[#D99B26] mr-2 tabular-nums">R{note.round}</span>
                {note.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
