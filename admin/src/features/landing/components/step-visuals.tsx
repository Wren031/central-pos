import * as React from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, MonitorSmartphone, Package, Printer, ScanLine, UserPlus } from 'lucide-react'
import { cn } from 'cn'
import type { HowItWorksIllustration } from '../site'

const EASE = [0.22, 1, 0.36, 1] as const

function Pop({
  delay = 0,
  children,
  className,
}: {
  delay?: number
  children: React.ReactNode
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  if (reduceMotion) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.4, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

function Shell({ children, tint }: { children: React.ReactNode; tint: string }) {
  return (
    <div
      className={cn(
        'flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border border-border p-3',
        tint
      )}
    >
      <div className="w-full">{children}</div>
    </div>
  )
}

function Panel({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <div className="flex items-center gap-1.5">
        <span className="text-primary">{icon}</span>
        <span className="text-[11px] font-semibold text-foreground">{label}</span>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function RegisterVisual() {
  return (
    <Shell tint="bg-primary/[0.08]">
      <Panel icon={<UserPlus className="size-3.5" aria-hidden />} label="Store account">
        <div className="space-y-1.5">
          <Pop delay={0.05}>
            <div className="h-4 rounded bg-muted" />
          </Pop>
          <Pop delay={0.12}>
            <div className="h-4 rounded bg-muted" />
          </Pop>
          <Pop delay={0.19}>
            <div className="flex h-5 items-center justify-center rounded bg-primary text-[10px] font-semibold text-primary-foreground">
              Create account
            </div>
          </Pop>
          <Pop delay={0.3}>
            <p className="flex items-center gap-1 pt-0.5 text-[10px] font-medium text-emerald-400">
              <Check className="size-3" aria-hidden />
              30-day trial active
            </p>
          </Pop>
        </div>
      </Panel>
    </Shell>
  )
}

const POS_TYPES = ['BBQ', 'Retail', 'Grocery', 'Cafe', 'Pharmacy', 'General'] as const

function SetupVisual() {
  return (
    <Shell tint="bg-violet-500/[0.1]">
      <Panel icon={<MonitorSmartphone className="size-3.5" aria-hidden />} label="Choose POS type">
        <div className="grid grid-cols-3 gap-1.5">
          {POS_TYPES.map((type, index) => (
            <Pop key={type} delay={0.05 + index * 0.06}>
              <div
                className={cn(
                  'rounded border px-1 py-1 text-center text-[9px] font-medium',
                  index === 0
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground'
                )}
              >
                {type}
              </div>
            </Pop>
          ))}
        </div>
      </Panel>
    </Shell>
  )
}

const CATALOG = [
  { name: 'Chicken BBQ', price: '₱45' },
  { name: 'Pork BBQ', price: '₱35' },
  { name: 'Garlic Rice', price: '₱20' },
  { name: 'Softdrinks', price: '₱25' },
] as const

function ProductsVisual() {
  return (
    <Shell tint="bg-emerald-500/[0.1]">
      <Panel icon={<Package className="size-3.5" aria-hidden />} label="Catalog">
        <div className="grid grid-cols-2 gap-1.5">
          {CATALOG.map((item, index) => (
            <Pop key={item.name} delay={0.05 + index * 0.06}>
              <div className="rounded border border-border bg-background p-1.5">
                <p className="truncate text-[9px] leading-tight font-semibold text-foreground">
                  {item.name}
                </p>
                <p className="text-[9px] leading-tight font-semibold text-primary">{item.price}</p>
              </div>
            </Pop>
          ))}
        </div>
      </Panel>
    </Shell>
  )
}

function CheckoutVisual() {
  const reduceMotion = useReducedMotion()
  return (
    <Shell tint="bg-amber-500/[0.1]">
      <div className="relative overflow-hidden rounded-lg border border-border bg-card p-2.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
            <ScanLine className="size-3.5 text-primary" aria-hidden />
            Current sale
          </span>
          <span className="text-[9px] text-muted-foreground">2 items</span>
        </div>
        <div className="mt-2 space-y-1">
          {[
            ['Chicken BBQ', '₱90.00'],
            ['Garlic Rice', '₱60.00'],
          ].map(([label, amount], index) => (
            <Pop key={label} delay={0.05 + index * 0.08}>
              <div className="flex justify-between rounded bg-muted px-1.5 py-1 text-[10px]">
                <span className="text-foreground">{label}</span>
                <span className="font-semibold text-foreground tabular-nums">{amount}</span>
              </div>
            </Pop>
          ))}
        </div>
        <div className="mt-2 flex items-baseline justify-between border-t border-border pt-1.5">
          <span className="text-[10px] font-semibold text-foreground">Total</span>
          <span className="text-[12px] font-bold text-foreground tabular-nums">₱235.00</span>
        </div>

        {!reduceMotion && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 h-px bg-red-500/80"
            initial={{ top: '12%', opacity: 0 }}
            whileInView={{ top: '84%', opacity: [0, 1, 1, 0] }}
            viewport={{ once: false }}
            transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 1.6, ease: 'easeInOut' }}
          />
        )}
      </div>
    </Shell>
  )
}

function ReceiptVisual() {
  return (
    <Shell tint="bg-sky-500/[0.1]">
      <Panel icon={<Printer className="size-3.5" aria-hidden />} label="Thermal printer">
        <div className="mx-auto w-4/5 overflow-hidden">
          <div className="h-1.5 rounded-t bg-muted-foreground/25" />
          <Pop delay={0.15}>
            <div className="space-y-[3px] rounded-b border border-t-0 border-slate-300 bg-white p-1.5">
              <p className="text-center text-[8px] font-bold text-slate-800">UNIPOS DEMO STORE</p>
              <div className="border-t border-dashed border-slate-200" />
              <div className="flex justify-between text-[7px] text-slate-500">
                <span>Chicken BBQ ×2</span>
                <span>₱90.00</span>
              </div>
              <div className="flex justify-between text-[7px] text-slate-500">
                <span>Garlic Rice ×3</span>
                <span>₱60.00</span>
              </div>
              <div className="flex justify-between border-t border-dashed border-slate-200 pt-[2px] text-[8px] font-bold text-slate-800">
                <span>TOTAL</span>
                <span>₱235.00</span>
              </div>
            </div>
          </Pop>
        </div>
      </Panel>
    </Shell>
  )
}

export function StepVisual({ kind }: { kind: HowItWorksIllustration }) {
  switch (kind) {
    case 'register':
      return <RegisterVisual />
    case 'setup':
      return <SetupVisual />
    case 'products':
      return <ProductsVisual />
    case 'checkout':
      return <CheckoutVisual />
    case 'receipt':
      return <ReceiptVisual />
  }
}
