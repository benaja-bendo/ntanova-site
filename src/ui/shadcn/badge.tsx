import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * Le badge (shadcn, retouché aux règles v2) : une pilule, parce qu'il qualifie ; jamais une action. Statuts doux : vert =
 * fait, jaune = attend quelqu'un, rouge = refusé, neutre = rien à faire. Toujours un mot, jamais la couleur seule.
 */
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full px-2.5 py-0.5 font-sans text-[13px] leading-5 font-bold whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3.5',
  {
    variants: {
      variant: {
        succes: 'bg-succes text-succes-foreground',
        attention: 'bg-attention text-attention-foreground',
        danger: 'bg-danger text-danger-foreground',
        neutre: 'bg-neutre text-neutre-foreground',
        carte: 'bg-card text-foreground',
        marque: 'bg-primary text-primary-foreground',
      },
    },
    defaultVariants: { variant: 'neutre' },
  },
);

function Badge({
  className,
  variant = 'neutre',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';
  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
