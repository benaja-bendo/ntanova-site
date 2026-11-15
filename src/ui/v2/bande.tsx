/** La bande d'information des planches v2, commune à l'espace relais et à l'administration. */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const tons = {
  succes: 'bg-succes text-succes-foreground',
  attention: 'bg-attention text-attention-foreground',
  danger: 'bg-danger text-danger-foreground',
  neutre: 'bg-muted text-foreground',
} as const;

/**
 * Une bande d'information (planche : « Tout est envoyé · dernier envoi à 16 h 36 ») : un fond d'état, une icône, une
 * phrase courte, au besoin un geste dessous. Jamais un mur de texte : la règle va dans l'aide.
 */
export function Bande({
  ton,
  icone,
  children,
  action,
  role,
  className,
  region,
}: {
  ton: keyof typeof tons;
  icone?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  role?: 'status' | 'alert' | undefined;
  className?: string;
  /** Une bande qu'on retrouve par son nom (« Doublon possible ») : elle devient une région nommée. */
  region?: string;
}) {
  const Element = region ? 'section' : 'div';
  return (
    <Element
      aria-label={region}
      role={role}
      className={cn(
        'flex flex-col gap-2.5 rounded-md px-3 py-2.5 text-sm [&_p]:m-0',
        tons[ton],
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        {icone && <span className="mt-px flex [&>svg]:size-5">{icone}</span>}
        <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
      </div>
      {action && <div className="flex flex-wrap gap-2 pl-[30px]">{action}</div>}
    </Element>
  );
}
