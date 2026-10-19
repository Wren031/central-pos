import * as React from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { cn } from 'cn'
import { FAQS } from '../site'
import { Container, Section, SectionHeading } from './primitives'
import { RevealItem } from './reveal'

function FaqItem({ question, answer, index }: { question: string; answer: string; index: number }) {
  const [open, setOpen] = React.useState(index === 0)
  const reduceMotion = useReducedMotion()
  const panelId = `faq-panel-${index}`
  const buttonId = `faq-button-${index}`

  return (
    <div
      className={cn(
        'rounded-xl border bg-card transition-colors',
        open ? 'border-primary/30' : 'border-border/70'
      )}
    >
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-4 rounded-xl px-5 py-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="text-sm font-semibold text-foreground sm:text-base">{question}</span>
          <ChevronDown
            aria-hidden
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform duration-300',
              open && 'rotate-180'
            )}
          />
        </button>
      </h3>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            role="region"
            aria-labelledby={buttonId}
            className="overflow-hidden"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="border-t border-border/70 px-5 py-4 text-sm leading-relaxed text-pretty text-muted-foreground">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function FaqSection() {
  return (
    <Section id="faq">
      <Container>
        <SectionHeading eyebrow="FAQ" title="Frequently asked questions" />
        <div className="mx-auto mt-12 grid max-w-3xl gap-3">
          {FAQS.map((item, index) => (
            <RevealItem key={item.q} index={index} step={0.05}>
              <FaqItem question={item.q} answer={item.a} index={index} />
            </RevealItem>
          ))}
        </div>
      </Container>
    </Section>
  )
}
