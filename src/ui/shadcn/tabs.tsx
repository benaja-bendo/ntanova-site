import * as React from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * Les onglets (shadcn, retouchés aux règles v2) : on passe d'un état d'une file à l'autre, chacun avec son compte. Un trait
 * de 3 px sous l'onglet ouvert, le texte en vert profond ; la rangée défile de côté si elle est trop large, jamais la page.
 */
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col', className)} {...props} />
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'flex w-full items-stretch gap-3.5 overflow-x-auto border-b border-border bg-card px-3 [scrollbar-width:none]',
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex h-11 flex-none cursor-pointer items-center gap-1 border-0 bg-transparent px-1 font-sans text-sm font-bold whitespace-nowrap text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset data-[state=active]:text-primary-strong data-[state=active]:shadow-[inset_0_-3px_0_var(--marque)]',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('flex-1 outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
