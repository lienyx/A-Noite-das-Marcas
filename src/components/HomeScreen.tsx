import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, BookOpen, Check, ChevronRight, Download, EyeOff, Moon, Shield, Users, Volume2, VolumeX } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { isSoundMuted, setSoundMuted } from '../utils/sound';

export function HomeScreen({ connected, initialRoomCode, pending, onCreateRoom, onJoinRoom, onOpenRules, onOpenRoles }: {
  connected: boolean;
  initialRoomCode: string;
  pending: boolean;
  onCreateRoom: (name: string) => void;
  onJoinRoom: (roomCode: string, name: string) => void;
  onOpenRules: () => void;
  onOpenRoles: () => void;
}) {
  const [mode, setMode] = useState<'join' | 'create'>(initialRoomCode ? 'join' : 'create');
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [muted, setMuted] = useState(isSoundMuted);

  useEffect(() => {
    if (initialRoomCode) { setRoomCode(initialRoomCode); setMode('join'); }
  }, [initialRoomCode]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!connected || pending || !name.trim()) return;
    if (mode === 'create') onCreateRoom(name.trim());
    else if (/^[A-HJ-NP-Z2-9]{4}$/.test(roomCode)) onJoinRoom(roomCode, name.trim());
  };

  return (
    <div className="landing">
      <header className="landing-header page-width">
        <a href="/" className="brand" aria-label="A Noite das Marcas — início">
          <BrandMark />
          <span>A NOITE<span>DAS MARCAS</span></span>
        </a>
        <nav className="landing-nav" aria-label="Navegação principal">
          <button onClick={onOpenRules}>Como jogar</button>
          <button onClick={onOpenRoles}>Os papéis <span>25</span></button>
          <a href="/assets/aistudio/noite-das-marcas-town-of-salem_0cc06509.pdf" target="_blank" rel="noreferrer" className="nav-rulebook"><BookOpen size={15} /> Livro de regras <Download size={13} /></a>
        </nav>
        <button className="sound-control" type="button" aria-label={muted ? 'Ativar som' : 'Desativar som'} aria-pressed={!muted} onClick={() => { setSoundMuted(!muted); setMuted(!muted); }}>
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </header>

      <main>
        <section className="hero page-width">
          <div className="hero-copy">
            <p className="eyebrow"><span /> UM JOGO DE DEDUÇÃO SOCIAL</p>
            <h1>Nesta cidade,<br />todo mundo<br />esconde <em>algo.</em></h1>
            <p className="hero-description">Uma identidade secreta. Uma cidade desconfiada.<br className="desktop-break" /> Reúna seus amigos e descubra em quem confiar<br className="desktop-break" /> antes da próxima badalada.</p>
            <div className="hero-facts"><span><Users size={15} /> 4–20 jogadores</span><i /><span><Moon size={15} /> Sem mestre</span><i /><span><EyeOff size={15} /> Papéis secretos</span></div>

            <div className="entry-panel" id="jogar">
              <div className="entry-tabs" role="tablist" aria-label="Escolha como jogar">
                <button id="create-tab" role="tab" aria-selected={mode === 'create'} aria-controls="entry-form" onClick={() => setMode('create')}>Criar uma sala <span>+</span></button>
                <button id="join-tab" role="tab" aria-selected={mode === 'join'} aria-controls="entry-form" onClick={() => setMode('join')}>Tenho um código <ArrowRight size={15} /></button>
              </div>
              <form id="entry-form" role="tabpanel" aria-labelledby={mode === 'create' ? 'create-tab' : 'join-tab'} onSubmit={handleSubmit}>
                <div className={`entry-fields ${mode === 'join' ? 'has-code' : ''}`}>
                  <div className="entry-field"><label htmlFor="player-name">COMO DEVEM CHAMAR VOCÊ?</label><input id="player-name" name="name" autoComplete="nickname" maxLength={24} minLength={1} required placeholder="Seu nome ou apelido" value={name} onChange={event => setName(event.target.value)} /></div>
                  {mode === 'join' && <div className="entry-field code-field"><label htmlFor="room-code">CÓDIGO DA SALA</label><input id="room-code" name="room" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={4} minLength={4} pattern="[A-HJ-NP-Z2-9]{4}" required placeholder="A7K9" value={roomCode} onChange={event => setRoomCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, ''))} /></div>}
                  <button className="entry-submit" type="submit" disabled={!connected || pending || !name.trim() || (mode === 'join' && roomCode.length !== 4)}>
                    <span>{pending ? 'Preparando sua entrada…' : !connected ? 'Conectando…' : mode === 'create' ? 'Que comece a noite' : 'Entrar na cidade'}</span><ArrowRight size={18} />
                  </button>
                </div>
                <p className="entry-hint"><Shield size={12} /> {mode === 'create' ? 'Crie a sala e compartilhe o convite. Todos jogam pelo celular.' : 'Peça o código de 4 caracteres para quem criou a sala.'}</p>
              </form>
            </div>
          </div>

          <div className="hero-art" aria-label="Ilustração de uma cidade antiga sob a lua cheia">
            <div className="art-topline"><span>QUANDO A NOITE CAI</span><span>NINGUÉM É INOCENTE.</span></div>
            <img src="/assets/cidade-noturna.svg" width="840" height="1000" alt="Uma cidade de telhados antigos, iluminada pela lua, com uma torre de relógio e janelas acesas." fetchPriority="high" />
            <div className="secret-card">
              <span className="secret-card-number">XXV</span>
              <BrandMark />
              <span className="secret-card-title">O seu segredo<br />muda o jogo.</span>
              <span className="secret-card-label">25 PAPÉIS · INFINITAS SUSPEITAS</span>
              <div className="card-ornament">◇</div>
            </div>
            <div className="art-caption"><span className="caption-line" /><span>Todos jogam.<br /><em>Ninguém narra.</em></span></div>
          </div>
        </section>

        <div className="interlude page-width"><span className={`connection-status ${connected ? 'is-connected' : ''}`} role="status"><span />{connected ? 'A cidade está à sua espera' : 'Conectando à cidade…'}</span><a href="#ritual">CONHEÇA O RITUAL <ArrowDown size={13} /></a><span className="interlude-note">Inspirado em Town of Salem</span></div>

        <section className="ritual-section" id="ritual">
          <div className="page-width">
            <div className="section-heading"><div><p className="eyebrow">ENTRE A CONFIANÇA E A TRAIÇÃO</p><h2>Uma noite. Quatro momentos.</h2></div><button onClick={onOpenRules}>Entenda as regras <ChevronRight size={16} /></button></div>
            <ol className="ritual-steps">
              <li><span className="step-number">01 <span>◇</span></span><h3>A Caçada</h3><p>Disfarce suas intenções. Investigue, proteja ou marque seu próximo alvo em segredo.</p></li>
              <li><span className="step-number">02 <span>◇</span></span><h3>A Badalada</h3><p>O sino toca. Todos passam pela urna. Um papel em branco também esconde uma escolha.</p></li>
              <li><span className="step-number">03 <span>◇</span></span><h3>A Dança dos Selos</h3><p>As marcas revelam suas consequências. Alguns se salvam. Outros viram fantasmas.</p></li>
              <li><span className="step-number">04 <span>◇</span></span><h3>O Tribunal</h3><p>Acuse, defenda, convença. A cidade vota — e nem sempre condena a pessoa certa.</p></li>
            </ol>
            <div className="first-night"><Check size={16} /><p><strong>Sua primeira noite?</strong> Escolha o baralho Clássico. O jogo distribui os papéis e conduz as fases para vocês.</p><button onClick={onOpenRoles}>Conhecer os papéis <ArrowRight size={16} /></button></div>
          </div>
        </section>
      </main>
      <footer className="landing-footer page-width"><a className="footer-brand" href="/">◇ A NOITE DAS MARCAS</a><span>Reúna os amigos. Guarde seu segredo.</span><a href="/assets/aistudio/noite-das-marcas-town-of-salem_0cc06509.pdf" target="_blank" rel="noreferrer">Regras originais <Download size={13} /></a></footer>
    </div>
  );
}
