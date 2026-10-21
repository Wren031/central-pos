import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAsync } from '@/hooks/use-async'
import { errorMessage } from '@/lib/errors'
import { peso } from '@/lib/format'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import type { SubscriptionPlan } from '@/lib/types'
import { cn } from 'cn'
import { FALLBACK_PLANS } from '../site'
import { Container, Section, SectionHeading } from './primitives'
import { RevealItem } from './reveal'

function durationLabel(days: number): string {
  if (days === 1) return 'per day'
  if (days === 7) return 'per week'
  if (days === 30) return 'per month'
  if (days === 365) return 'per year'
  return `per ${days} days`
}

export function PricingSection() {
  const plans = useAsync(async () => {
    if (!supabaseConfigured) return null
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('active', true)
      .order('sort_order')
    if (error) throw new Error(errorMessage(error))
    return (data ?? []) as SubscriptionPlan[]
  }, [])

  const list =
    plans.data && plans.data.length > 0
      ? plans.data.map((plan) => ({
          id: plan.id,
          name: plan.name,
          duration_days: plan.duration_days,
          price: Number(plan.price),
          is_trial: plan.is_trial,
          description: plan.description,
        }))
      : FALLBACK_PLANS

  return (
    <Section id="pricing">
      <Container>
        <SectionHeading
          eyebrow="Subscription plans"
          title="Start free, subscribe when you’re ready"
          description="Every account begins with a full-access 30-day free trial. No credit card required."
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((plan, index) => {
            const highlighted =
              plan.id === 'monthly' || (!plan.is_trial && plan.duration_days === 30)
            return (
              <RevealItem key={plan.id} index={index} className="relative h-full">
                {highlighted && (
                  <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold text-primary-foreground">
                    Most popular
                  </span>
                )}
                <Card
                  className={cn(
                    'h-full transition-shadow duration-300 hover:ring-primary/35',
                    highlighted && 'ring-2 ring-primary/40'
                  )}
                >
                  <CardHeader>
                    <CardTitle>{plan.name}</CardTitle>
                    <CardDescription className="min-h-4">
                      {plan.description ?? `${plan.duration_days}-day access`}
                    </CardDescription>
                    <p className="mt-3">
                      {plan.price === 0 ? (
                        <span className="text-3xl font-semibold tracking-tight text-foreground">
                          Free
                        </span>
                      ) : (
                        <>
                          <span className="text-3xl font-semibold tracking-tight text-foreground">
                            {peso(plan.price)}
                          </span>
                          <span className="ml-1 text-xs text-muted-foreground">
                            {durationLabel(plan.duration_days)}
                          </span>
                        </>
                      )}
                    </p>
                    <p className="text-xs font-medium text-primary">{plan.duration_days} days</p>

                    <ul className="mt-4 space-y-2">
                      {[
                        plan.is_trial
                          ? 'Full access for 30 days'
                          : `${plan.duration_days} days of access`,
                        'Offline sales & reports',
                        'Receipt printing (incl. Bluetooth)',
                        'All POS types included',
                      ].map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardHeader>

                  <div className="mt-auto px-(--card-spacing) pt-5">
                    <Button
                      asChild
                      variant={highlighted ? 'default' : 'outline'}
                      className="w-full"
                    >
                      <a href="#download">
                        {plan.is_trial ? 'Download the app' : 'Get the app'}
                      </a>
                    </Button>
                  </div>
                </Card>
              </RevealItem>
            )
          })}
        </div>
      </Container>
    </Section>
  )
}
