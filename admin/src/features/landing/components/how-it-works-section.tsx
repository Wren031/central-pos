import { HOW_IT_WORKS } from '../site'
import { Container, Section, SectionHeading } from './primitives'
import { RevealItem } from './reveal'
import { StepVisual } from './step-visuals'

export function HowItWorksSection() {
  return (
    <Section id="how-it-works" tone="muted">
      <Container>
        <SectionHeading
          eyebrow="How it works"
          title="From sign-up to first sale in minutes"
          description="Five steps, no training required — and every one of them keeps working when the connection drops."
        />

        <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {HOW_IT_WORKS.map((item, index) => (
            <li key={item.step} className="h-full">
              <RevealItem index={index} step={0.07} className="flex h-full flex-col">
                <StepVisual kind={item.illustration} />
                <div className="mt-4 flex items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {item.step}
                  </span>
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">
                    {item.title}
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
                  {item.description}
                </p>
              </RevealItem>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  )
}
