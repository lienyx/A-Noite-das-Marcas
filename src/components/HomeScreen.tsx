import { useEffect, useState } from 'react';
import { BookOpen, DoorOpen, PlusCircle } from 'lucide-react';

export function HomeScreen({
  connected,
  initialRoomCode,
  onCreateRoom,
  onJoinRoom,
  onOpenRules,
}: {
  connected: boolean;
  initialRoomCode: string;
  onCreateRoom: (name: string) => void;
  onJoinRoom: (roomCode: string, name: string) => void;
  onOpenRules: () => void;
}) {
  const [mode, setMode] = useState<'join' | 'create'>(initialRoomCode ? 'join' : 'join');
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState(initialRoomCode);

  useEffect(() => {
    if (initialRoomCode) {
      setRoomCode(initialRoomCode);
      setMode('join');
    }
  }, [initialRoomCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    if (mode === 'create') {
      onCreateRoom(cleanName);
    } else {
      const cleanCode = roomCode.trim().toUpperCase();
      if (cleanCode.length < 3) return;
      onJoinRoom(cleanCode, cleanName);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between px-4 py-8 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
        <span className="font-display text-lg font-bold tracking-wide text-[#F5EBD6] whitespace-nowrap shrink-0">
          A Noite das Marcas
        </span>
        <button
          type="button"
          onClick={onOpenRules}
          className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#161922] px-4 py-2 text-xs font-medium text-[#D6CFC2] hover:text-white hover:border-white/25 transition-colors whitespace-nowrap shrink-0"
        >
          <BookOpen className="w-4 h-4 text-[#D99B26]" />
          Regras e Papéis
        </button>
      </header>

      <main className="my-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        <section className="lg:col-span-6 space-y-5">
          <p className="text-xs font-medium tracking-wider text-[#D99B26]">
            Versão Town of Salem sem Mestre
          </p>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight text-[#F5EBD6]">
            Todos jogam, ninguém narra.
          </h1>
          <p className="text-sm sm:text-base leading-relaxed text-[#B6AEA0] max-w-xl">
            Cada convidado joga diretamente pelo celular em sigilo absoluto: receba seu pergaminho, aplique selos e amuletos sem ser visto, acenda a Urna na Badalada e decida o destino da cidade no Tribunal.
          </p>

          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-white/10 text-xs">
            <div>
              <p className="font-mono text-lg font-semibold text-[#F5EBD6] tabular-nums">25</p>
              <p className="text-[#8A8277]">Papéis oficiais</p>
            </div>
            <div>
              <p className="font-mono text-lg font-semibold text-[#F5EBD6] tabular-nums">20</p>
              <p className="text-[#8A8277]">Missões secretas</p>
            </div>
            <div>
              <p className="font-mono text-lg font-semibold text-[#F5EBD6] tabular-nums">100%</p>
              <p className="text-[#8A8277]">Anônimo no celular</p>
            </div>
          </div>
        </section>

        <section className="lg:col-span-6">
          <div className="rounded-2xl border border-white/10 bg-[#161922] p-5 sm:p-6 shadow-xl space-y-5">
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#0C0E14] p-1 border border-white/10">
              <button
                type="button"
                onClick={() => setMode('join')}
                className={`min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  mode === 'join'
                    ? 'bg-[#D99B26] text-[#0C0E14]'
                    : 'text-[#A8A095] hover:text-white'
                }`}
              >
                <DoorOpen className="w-4 h-4" />
                Entrar na Sala
              </button>
              <button
                type="button"
                onClick={() => setMode('create')}
                className={`min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  mode === 'create'
                    ? 'bg-[#D99B26] text-[#0C0E14]'
                    : 'text-[#A8A095] hover:text-white'
                }`}
              >
                <PlusCircle className="w-4 h-4" />
                Criar Nova Sala
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="player-name" className="block text-xs font-medium text-[#D6CFC2]">
                  Seu nome na festa
                </label>
                <input
                  id="player-name"
                  type="text"
                  maxLength={24}
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Mariana"
                  className="w-full min-h-[48px] rounded-xl border border-white/15 bg-[#0C0E14] px-4 py-2.5 text-sm text-white placeholder-[#6E675E] focus:border-[#D99B26] focus:outline-none"
                />
              </div>

              {mode === 'join' && (
                <div className="space-y-1.5">
                  <label htmlFor="room-code" className="block text-xs font-medium text-[#D6CFC2]">
                    Código da sala
                  </label>
                  <input
                    id="room-code"
                    type="text"
                    maxLength={6}
                    required
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    placeholder="Ex.: A7K9"
                    className="w-full min-h-[48px] rounded-xl border border-white/15 bg-[#0C0E14] px-4 py-2.5 font-mono text-base tracking-widest uppercase text-white placeholder-[#6E675E] focus:border-[#D99B26] focus:outline-none"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={!connected || !name.trim() || (mode === 'join' && roomCode.trim().length < 3)}
                className="w-full min-h-[48px] rounded-xl bg-[#D99B26] px-5 py-3 text-sm font-bold text-[#0C0E14] transition-transform active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed hover:bg-[#E5AA36]"
              >
                {!connected
                  ? 'Conectando...'
                  : mode === 'create'
                    ? 'Criar Sala e Convidar'
                    : 'Entrar na Partida'}
              </button>
            </form>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 pt-4 flex items-center justify-between text-xs text-[#8A8277]">
        <span>Para 4 a 20 jogadores (ideal 13 a 15)</span>
        <span>Sincronizado em tempo real</span>
      </footer>
    </div>
  );
}
