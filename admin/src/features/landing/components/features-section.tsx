import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FEATURES } from '../site'
import { Container, Section, SectionHeading } from './primitives'
import { RevealItem } from './reveal'

export function FeaturesSection() {
  return (
    <Section id="features" tone="muted">
      <Container>
        <SectionHeading
          eyebrow="Features"
          title="Everything a busy counter needs"
          description="Built for real-world selling — from a single grill station to a full retail floor."
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <RevealItem key={feature.title} index={index} className="h-full">
              <Card className="h-full transition-[transform,box-shadow] duration-300 ease-out motion-safe:hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5">
                <CardHeader>
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <feature.icon className="size-5" aria-hidden />
                  </span>
                  <CardTitle className="mt-2">{feature.title}</CardTitle>
                  <CardDescription className="leading-relaxed">{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            </RevealItem>
          ))}
        </div>
      </Container>
    </Section>
  )
}
