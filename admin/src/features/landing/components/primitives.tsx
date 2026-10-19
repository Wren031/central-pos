import * as React from 'react'
import { cn } from 'cn'
import { Reveal } from './reveal'

/** Shared page gutter — keeps every section on the same rhythm. */
export function Container({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6', className)}>{children}</div>
}

/** Alternating section band with an anchor target for in-page navigation. */
export function Section({
  id,
  children,
  className,
  tone = 'plain',
}: {
  id?: string
  children: React.ReactNode
  className?: string
  tone?: 'plain' | 'muted'
}) {
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-20 py-16 sm:py-20 lg:py-24',
        tone === 'muted' && 'border-y border-border bg-muted/60',
        className
      )}
    >
      {children}
    </section>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  center = true,
  className,
}: {
  eyebrow: string
  title: string
  description?: string
  center?: boolean
  className?: string
}) {
  return (
    <Reveal className={cn(center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl', className)}>
      <p className="text-xs font-semibold tracking-wider text-primary uppercase">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="mt-3 text-base text-pretty text-muted-foreground">{description}</p>
      )}
    </Reveal>
  )
}
