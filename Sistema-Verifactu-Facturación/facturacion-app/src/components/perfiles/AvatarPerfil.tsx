import { iniciales, type Perfil } from '@/lib/perfiles';

/** El círculo con las iniciales y el color de la persona. */
export default function AvatarPerfil({
  perfil, tam = 32, className = '',
}: { perfil: Pick<Perfil, 'nombre' | 'color'>; tam?: number; className?: string }) {
  return (
    <span
      className={`perfil-avatar ${className}`}
      style={{ width: tam, height: tam, fontSize: Math.round(tam * 0.38), background: perfil.color }}
      aria-hidden="true"
    >
      {iniciales(perfil.nombre)}
    </span>
  );
}
