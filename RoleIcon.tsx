import {
  BadgeAlert,
  Crown,
  Droplets,
  Eye,
  Flame,
  Gavel,
  Ghost,
  HeartHandshake,
  HelpCircle,
  Lock,
  Music,
  Scale,
  Search,
  Shield,
  ShieldCheck,
  Skull,
  Sparkles,
  Stethoscope,
  Swords,
  User,
  UserCheck,
  VolumeX,
} from 'lucide-react';
import type { Faction, RoleId } from '../shared/gameData';

export function getFactionMeta(faction: Faction): {
  label: string;
  textColor: string;
  borderColor: string;
  bgTint: string;
} {
  switch (faction) {
    case 'CIDADE':
      return {
        label: 'Cidade',
        textColor: 'text-[#6EE7B7]',
        borderColor: 'border-[#10B981]/30',
        bgTint: 'bg-[#10B981]/10',
      };
    case 'MAFIA':
      return {
        label: 'Máfia',
        textColor: 'text-[#FCA5A5]',
        borderColor: 'border-[#C83232]/40',
        bgTint: 'bg-[#C83232]/12',
      };
    case 'NEUTRO_MATADOR':
      return {
        label: 'Neutro Matador',
        textColor: 'text-[#93C5FD]',
        borderColor: 'border-[#3B82F6]/35',
        bgTint: 'bg-[#3B82F6]/12',
      };
    case 'NEUTRO_CAOS':
      return {
        label: 'Neutro Caos',
        textColor: 'text-[#FCD34D]',
        borderColor: 'border-[#D99B26]/35',
        bgTint: 'bg-[#D99B26]/12',
      };
    case 'NEUTRO_BENIGNO':
      return {
        label: 'Neutro Benigno',
        textColor: 'text-[#E2E8F0]',
        borderColor: 'border-white/20',
        bgTint: 'bg-white/5',
      };
  }
}

export function RoleIcon({
  roleId,
  className = 'w-5 h-5',
}: {
  roleId: RoleId | null;
  className?: string;
}) {
  switch (roleId) {
    case 'xerife':
      return <BadgeAlert className={className} />;
    case 'investigador':
      return <Search className={className} />;
    case 'legista':
      return <Eye className={className} />;
    case 'doutor':
      return <Stethoscope className={className} />;
    case 'guarda_costas':
      return <Shield className={className} />;
    case 'carcereiro':
      return <Lock className={className} />;
    case 'justiceiro':
      return <Gavel className={className} />;
    case 'prefeito':
      return <Crown className={className} />;
    case 'marechal':
      return <Scale className={className} />;
    case 'medium':
      return <Ghost className={className} />;
    case 'retribucionista':
      return <Sparkles className={className} />;
    case 'dancarina':
    case 'consorte':
      return <Music className={className} />;
    case 'chefao':
      return <Crown className={className} />;
    case 'mafioso':
      return <Skull className={className} />;
    case 'chantagista':
      return <VolumeX className={className} />;
    case 'conselheiro':
      return <UserCheck className={className} />;
    case 'sobrevivente':
      return <ShieldCheck className={className} />;
    case 'anjo_da_guarda':
      return <HeartHandshake className={className} />;
    case 'assassino_em_serie':
      return <Skull className={className} />;
    case 'incendiario':
      return <Flame className={className} />;
    case 'bobo_da_corte':
      return <HelpCircle className={className} />;
    case 'carrasco':
      return <Droplets className={className} />;
    case 'pirata':
      return <Swords className={className} />;
    case 'convidado':
    default:
      return <User className={className} />;
  }
}
