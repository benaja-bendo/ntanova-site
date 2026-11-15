import { Icone } from '@/ui/icones/Icone';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <Icone nom="cercleCoche" className="size-4" />,
        info: <Icone nom="info" className="size-4" />,
        warning: <Icone nom="alerte" className="size-4" />,
        error: <Icone nom="cercleCroix" className="size-4" />,
        loading: <Icone nom="chargement" className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
