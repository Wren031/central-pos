import {
  Coffee,
  Cross,
  Flame,
  ShoppingBag,
  ShoppingBasket,
  Store,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import type { PosTheme } from './pos-types'

/**
 * Presentation layer for POS types.
 *
 * The POS-type *catalog* (id, name, description, active flag, categories) is the
 * single source of truth in Supabase and is managed from the admin dashboard.
 * Supabase has no theme colors, so this module derives a stable, good-looking
 * theme and icon for any id — including new ones an admin creates.
 */

/** Hand-tuned palettes for the built-in types; anything else is derived. */
const THEME_PRESETS: Record<string, PosTheme> = {
  bbq: { hue: 14, accent: '#c2410c', accentSoft: '#ffedd5', accentFg: '#ffffff', chart: ['#c2410c', '#f97316', '#fdba74'] },
  retail: { hue: 262, accent: '#6d28d9', accentSoft: '#ede9fe', accentFg: '#ffffff', chart: ['#6d28d9', '#8b5cf6', '#c4b5fd'] },
  grocery: { hue: 142, accent: '#15803d', accentSoft: '#dcfce7', accentFg: '#ffffff', chart: ['#15803d', '#22c55e', '#86efac'] },
  restaurant: { hue: 350, accent: '#be123c', accentSoft: '#ffe4e6', accentFg: '#ffffff', chart: ['#be123c', '#f43f5e', '#fda4af'] },
  cafe: { hue: 28, accent: '#b45309', accentSoft: '#fef3c7', accentFg: '#ffffff', chart: ['#b45309', '#f59e0b', '#fcd34d'] },
  pharmacy: { hue: 198, accent: '#0369a1', accentSoft: '#e0f2fe', accentFg: '#ffffff', chart: ['#0369a1', '#0ea5e9', '#7dd3fc'] },
  general: { hue: 217, accent: '#1d4ed8', accentSoft: '#dbeafe', accentFg: '#ffffff', chart: ['#1d4ed8', '#3b82f6', '#93c5fd'] },
}

/** Map the `icon` text column to a lucide component. */
const ICON_MAP: Record<string, LucideIcon> = {
  flame: Flame,
  shoppingbag: ShoppingBag,
  shoppingbasket: ShoppingBasket,
  utensilscrossed: UtensilsCrossed,
  coffee: Coffee,
  cross: Cross,
  store: Store,
}

function hashHue(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) % 360
  }
  return hash
}

export function iconForName(name: string | null | undefined): LucideIcon {
  if (!name) return Store
  return ICON_MAP[name.trim().toLowerCase()] ?? Store
}

/** A stable, readable theme for any POS type id. */
export function themeForId(id: string): PosTheme {
  const preset = THEME_PRESETS[id]
  if (preset) return preset
  const hue = hashHue(id)
  return {
    hue,
    accent: `hsl(${hue} 62% 40%)`,
    accentSoft: `hsl(${hue} 70% 94%)`,
    accentFg: '#ffffff',
    chart: [`hsl(${hue} 62% 40%)`, `hsl(${hue} 70% 50%)`, `hsl(${hue} 75% 72%)`],
  }
}
