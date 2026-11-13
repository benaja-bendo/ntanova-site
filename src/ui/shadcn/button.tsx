import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * Le bouton (shadcn, retouché aux règles v2) : un rectangle de 8 px, parce qu'on agit ; un seul bouton plein par écran ;
 * Nunito Sans 700 ; anneau de focus de 3 px ; appui plus sombre ; survol seulement sur un appareil qui survole.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md font-sans font-bold whitespace-nowrap no-underline transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default:
          'border-2 border-primary bg-primary text-primary-foreground active:border-primary-strong active:bg-primary-strong [@media(hover:hover)]:hover:border-primary-strong [@media(hover:hover)]:hover:bg-primary-strong',
        outline:
          'border-2 border-primary bg-card text-primary active:bg-succes [@media(hover:hover)]:hover:bg-succes',
        quiet:
          'border border-input bg-card text-foreground active:bg-muted [@media(hover:hover)]:hover:bg-muted',
        destructive:
          'border border-destructive bg-card text-destructive active:bg-danger [@media(hover:hover)]:hover:bg-danger',
        ghost:
          'border-0 bg-transparent text-foreground active:bg-muted [@media(hover:hover)]:hover:bg-muted',
        link: 'h-auto border-0 bg-transparent px-0 text-primary underline underline-offset-4',
      },
      size: {
        sm: 'h-10 px-3 text-sm',
        default: 'h-11 px-4 text-[15px]',
        lg: 'h-12 px-5 text-base',
        xl: 'h-[52px] px-5 text-[17px]',
        hero: 'h-[60px] px-6 text-lg',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
