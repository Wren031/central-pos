import type { LucideIcon } from 'lucide-react'

/**
 * POS type definitions.
 *
 * The catalog itself lives in Supabase (`pos_types` + `pos_type_categories`),
 * managed from the admin dashboard, and is read through the synchronous
 * resolver in `@/database/repos/pos-catalog`. This module only owns the shape
 * used for rendering; themes/icons are derived in `./pos-presentation`.
 */

export interface PosTheme {
  hue: number
  accent: string
  accentSoft: string
  accentFg: string
  chart: [string, string, string]
}

export interface PosTypeDef {
  id: string
  name: string
  tagline: string
  description: string
  icon: LucideIcon
  theme: PosTheme
  /** Category names assigned to this POS type (from Supabase). */
  categories: string[]
  /** Admin-controlled: whether barcode scanning is offered for this POS type. */
  barcodeEnabled: boolean
}

export {
  getPosType,
  getPosTypes,
  getPosTypeRecords,
  getPosTypeCategories,
  posTypeHue,
  isPosCatalogEmpty,
} from '@/database/repos/pos-catalog'
