import { useState } from 'react';
import { X } from 'lucide-react';
import { ALL_ROLE_IDS, ROLES, type Faction } from '../shared/gameData';
import { RoleIcon, getFactionMeta } from './RoleIcon';

export function RulesModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'regras' | 'papeis'>('regras');
  const [factionFilter, setFactionFilter] = useState<'ALL' | Faction>('ALL');

  if (!open) return null;

  const filteredRoles = ALL_ROLE_IDS.filter((id) => {
    if (factionFilter === 'ALL') return true;
    return ROLES[id].faction === factionFilter;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Regras e Papéis"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[#12151E] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="font-display text-lg font-bold text-[#F5EBD6]">
            Livro de Regras e Papéis
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar regras"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#A8A095] hover:bg-white/5 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="border-b border-white/10 px-5 py-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('regras')}
            className={`min-h-[40px] rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === 'regras'
                ? 'bg-[#D99B26] text-[#0C0E14]'
                : 'text-[#A8A095] hover:text-white'
            }`}
          >
            Como Jogar
          </button>
          <button
            type="button"
            onClick={() => setTab('papeis')}
            className={`min-h-[40px] rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === 'papeis'
                ? 'bg-[#D99B26] text-[#0C0E14]'
                : 'text-[#A8A095] hover:text-white'
            }`}
          >
            Todos os 25 Papéis
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm text-[#D6CFC2]">
          {tab === 'regras' ? (
            <div className="space-y-5">
              <section className="space-y-2">
                <h3 className="font-display text-base font-bold text-[#F5EBD6]">
                  Todos jogam, ninguém narra
                </h3>
                <p className="leading-relaxed">
                  A lista de papéis em jogo é pública para toda a sala, mas ninguém sabe quem tirou o quê. Cada celular recebe um Pergaminho secreto, adesivos digitais, fichas da Urna e uma Missão Secreta para despiste durante a festa.
                </p>
              </section>

              <section className="space-y-2 border-t border-white/10 pt-4">
                <h3 className="font-display text-base font-bold text-[#F5EBD6]">
                  Lados e condições de vitória
                </h3>
                <ul className="space-y-2 text-xs leading-relaxed">
                  <li>
                    <strong className="text-[#6EE7B7]">Cidade:</strong> Máfia e Matadores Neutros (Assassino em Série, Incendiário) saem do jogo. Neutros de Caos e Benignos não impedem a vitória.
                  </li>
                  <li>
                    <strong className="text-[#FCA5A5]">Máfia:</strong> Os mafiosos vivos são metade ou mais dos jogadores vivos.
                  </li>
                  <li>
                    <strong className="text-[#93C5FD]">Matadores Neutros:</strong> Sobra apenas o matador e mais 1 pessoa viva (se sobrarem os dois, vencem juntos).
                  </li>
                  <li>
                    <strong className="text-[#FCD34D]">Neutros de Caos e Benignos:</strong> Cada um cumpre seu objetivo (Bobo preso, Carrasco, Pirata com 2 duelos, Sobrevivente vivo, Anjo com protegido vivo).
                  </li>
                </ul>
              </section>

              <section className="space-y-2 border-t border-white/10 pt-4">
                <h3 className="font-display text-base font-bold text-[#F5EBD6]">
                  Fases de cada rodada
                </h3>
                <ol className="space-y-2.5 text-xs leading-relaxed list-decimal pl-4">
                  <li>
                    <strong>Caçada:</strong> Festa normal e ações secretas no celular. Você pode olhar as costas de todos os outros jogadores na aba Praça, mas nunca vê as suas próprias costas. Quem tem poder age em segredo.
                  </li>
                  <li>
                    <strong>Badalada (Urna):</strong> O alarme toca. Todos depositam um papel na Urna digital (Fósforo, Bala, Execução, Cale-se ou papel em branco para manter o anonimato). Sobrevivente pode ativar seu Colete.
                  </li>
                  <li>
                    <strong>Dança dos Selos:</strong> A Urna abre. Bala e Execução matam na hora (ignoram amuleto). Selo Vermelho, Selo Negro e Gota Azul com Fósforo matam, salvo por Amuleto Branco (remove todos os adesivos), Colete ou Escudo Dourado (Guarda-Costas morre no lugar). Gotas azuis sem Fósforo permanecem nas costas.
                  </li>
                  <li>
                    <strong>Tribunal:</strong> Debate e votação. Quem recebeu Cale-se só ouve e vota. Prefeito revelado vale 3 votos; Marechal revelado prende os 2 mais votados. Empate não prende ninguém. O preso revela seu pergaminho a todos e vira fantasma.
                  </li>
                </ol>
              </section>

              <section className="space-y-2 border-t border-white/10 pt-4">
                <h3 className="font-display text-base font-bold text-[#F5EBD6]">
                  Fantasmas e bloqueios
                </h3>
                <p className="text-xs leading-relaxed">
                  <strong>Bloqueio (Dançarina, Consorte, Carcereiro):</strong> Até a próxima Badalada, a pessoa bloqueada não cola adesivos especiais, não investiga, não solta fichas e não usa poderes.
                </p>
                <p className="text-xs leading-relaxed">
                  <strong>Fantasmas:</strong> Não falam sobre o caso com vivos, exceto por 1 Sussurro do Além (uma única frase privada para 1 vivo), conversas livres no canal do Médium e exame do Legista.
                </p>
              </section>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['ALL', 'Todos'],
                    ['CIDADE', 'Cidade'],
                    ['MAFIA', 'Máfia'],
                    ['NEUTRO_MATADOR', 'Matadores'],
                    ['NEUTRO_CAOS', 'Caos'],
                    ['NEUTRO_BENIGNO', 'Benignos'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFactionFilter(key)}
                    className={`min-h-[36px] rounded-lg px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                      factionFilter === key
                        ? 'bg-[#D99B26] text-[#0C0E14] font-semibold'
                        : 'border border-white/10 bg-[#161922] text-[#A8A095] hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="space-y-2.5">
                {filteredRoles.map((id) => {
                  const r = ROLES[id];
                  const f = getFactionMeta(r.faction);
                  return (
                    <div
                      key={id}
                      className="rounded-xl border border-white/10 bg-[#161922] p-3.5 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${f.borderColor} ${f.bgTint} ${f.textColor}`}>
                            <RoleIcon roleId={id} className="w-4 h-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-display text-sm font-bold text-[#F5EBD6] truncate">
                              {r.name}
                            </p>
                            <p className="text-[11px] text-[#A8A095]">
                              {f.label} · Aparência: {r.appearance} · {r.groupLabel}
                            </p>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed text-[#D6CFC2]">
                        {r.summary}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
