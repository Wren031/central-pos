import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAsync } from '@/hooks/use-async'
import { posTypeIcon } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import type { PosType } from '@/lib/types'
import { FALLBACK_POS_TYPES } from '../site'
import { Container, Section, SectionHeading } from './primitives'
import { RevealItem } from './reveal'

export function PosTypesSection() {
  const posTypes = useAsync(async () => {
    if (!supabaseConfigured) return null
    const { data, error } = await supabase
      .from('pos_types')
      .select('*')
      .eq('active', true)
      .order('sort_order')
    if (error) throw new Error(errorMessage(error))
    return (data ?? []) as PosType[]
  }, [])

  const types =
    posTypes.data && posTypes.data.length > 0
      ? posTypes.data.map((type) => ({
          id: type.id,
          name: type.name,
          tagline: type.tagline ?? type.description ?? 'Purpose-built layout',
        }))
      : FALLBACK_POS_TYPES

  return (
    <Section id="pos-types">
      <Container>
        <SectionHeading
          eyebrow="POS types"
          title="A layout for every kind of store"
          description="Pick the POS type that matches your trade — the catalog, categories, and screens are arranged for it."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {types.map((type, index) => {
            const Icon = posTypeIcon(type.id)
            return (
              <RevealItem key={type.id} index={index} className="h-full">
                <Card
                  data-size="sm"
                  className="h-full transition-[transform,box-shadow] duration-300 ease-out motion-safe:hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5"
                >
                  <CardHeader>
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <CardTitle className="mt-2">{type.name}</CardTitle>
                    <CardDescription>{type.tagline}</CardDescription>
                  </CardHeader>
                </Card>
              </RevealItem>
            )
          })}
        </div>
      </Container>
    </Section>
  )
}
