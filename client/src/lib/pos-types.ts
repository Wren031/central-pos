import {
  Coffee,
  Cross,
  Flame,
  ShoppingBasket,
  ShoppingBag,
  Store,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import type { PosTypeId } from './types'

export interface SeedProduct {
  name: string
  category: string
  price: number
  emoji: string
  stock: number
}

export interface PosTheme {
  hue: number
  accent: string
  accentSoft: string
  accentFg: string
  chart: [string, string, string]
}

export interface PosTypeDef {
  id: PosTypeId
  name: string
  tagline: string
  description: string
  icon: LucideIcon
  features: string[]
  theme: PosTheme
  categories: string[]
  products: SeedProduct[]
}

function p(name: string, category: string, price: number, emoji: string, stock: number): SeedProduct {
  return { name, category, price, emoji, stock }
}

export const POS_TYPES: PosTypeDef[] = [
  {
    id: 'bbq',
    name: 'BBQ POS',
    tagline: 'Grill houses & ihawan',
    description:
      'Built for Filipino barbecue stalls and ihawan — fast order taking for dine-in, takeout, and bilao catering with per-kilo tracking.',
    icon: Flame,
    features: ['Kilo & per-piece pricing', 'Takeout / delivery tickets', 'Charcoal & meat inventory'],
    theme: {
      hue: 14,
      accent: '#c2410c',
      accentSoft: '#ffedd5',
      accentFg: '#ffffff',
      chart: ['#c2410c', '#f97316', '#fdba74'],
    },
    categories: ['Grilled Meat', 'Rice Meals', 'Inihaw na Isda', 'Drinks', 'Desserts'],
    products: [
      p('Chicken Inasal (Quarter)', 'Grilled Meat', 89, '🍗', 60),
      p('Pork BBQ Stick', 'Grilled Meat', 25, '🍢', 120),
      p('Beef Tapa Plate', 'Rice Meals', 145, '🥩', 40),
      p('Pork Sisig Sizzling', 'Rice Meals', 125, '🍲', 35),
      p('Bangus Sisig', 'Rice Meals', 135, '🐟', 25),
      p('Grilled Pork Belly (Kilo)', 'Grilled Meat', 780, '🥓', 15),
      p('Chicken Whole Inihaw', 'Grilled Meat', 320, '🐔', 12),
      p('Grilled Tanigue', 'Inihaw na Isda', 180, '🐠', 20),
      p('Grilled Pusit', 'Inihaw na Isda', 160, '🦑', 18),
      p('Grilled Liempo Slice', 'Grilled Meat', 95, '🥩', 30),
      p('Garlic Rice', 'Rice Meals', 25, '🍚', 200),
      p('Steamed Rice', 'Rice Meals', 20, '🍚', 200),
      p('Coke Regular 355ml', 'Drinks', 25, '🥤', 90),
      p('Sago’t Gulaman', 'Drinks', 35, '🧋', 50),
      p('Calamansi Juice', 'Drinks', 30, '🍋', 45),
      p('Leche Flan', 'Desserts', 45, '🍮', 25),
      p('Halo-Halo', 'Desserts', 75, '🍧', 20),
      p('Kamote Cues (3 pcs)', 'Desserts', 40, '🍠', 30),
    ],
  },
  {
    id: 'retail',
    name: 'Retail Store POS',
    tagline: 'Boutiques & sari-sari retail',
    description:
      'General retail checkout with barcode-style SKU search, promotions, and stock counts for apparel, gadgets, and variety stores.',
    icon: ShoppingBag,
    features: ['SKU & barcode search', 'Promo & discount engine', 'Stock alerts'],
    theme: {
      hue: 262,
      accent: '#6d28d9',
      accentSoft: '#ede9fe',
      accentFg: '#ffffff',
      chart: ['#6d28d9', '#8b5cf6', '#c4b5fd'],
    },
    categories: ['Apparel', 'Accessories', 'Home Items', 'Gadgets', 'Personal Care'],
    products: [
      p('Classic White Tee', 'Apparel', 199, '👕', 45),
      p('Denim Jeans', 'Apparel', 599, '👖', 25),
      p('Polo Shirt', 'Apparel', 349, '👔', 30),
      p('Hooded Jacket', 'Apparel', 899, '🧥', 15),
      p('Baseball Cap', 'Accessories', 149, '🧢', 40),
      p('Canvas Tote Bag', 'Accessories', 250, '👜', 35),
      p('Leather Belt', 'Accessories', 275, '🧷', 28),
      p('Stainless Watch', 'Accessories', 950, '⌚', 12),
      p('Ceramic Mug', 'Home Items', 120, '☕', 50),
      p('Scented Candle', 'Home Items', 180, '🕯️', 30),
      p('Throw Pillow', 'Home Items', 220, '🛋️', 22),
      p('Bluetooth Speaker', 'Gadgets', 799, '🔊', 18),
      p('USB-C Cable 2m', 'Gadgets', 199, '🔌', 60),
      p('Phone Ring Holder', 'Gadgets', 99, '📱', 70),
      p('Hand Sanitizer 250ml', 'Personal Care', 89, '🧴', 55),
      p('Sunscreen SPF50', 'Personal Care', 320, '🧴', 20),
      p('Body Lotion', 'Personal Care', 210, '🧴', 26),
      p('Hair Pomade', 'Personal Care', 165, '💇', 24),
    ],
  },
  {
    id: 'grocery',
    name: 'Grocery POS',
    tagline: 'Supermarkets & wet-market grocers',
    description:
      'High-volume scanning checkout with weight-based items, expiry tracking, and bulk pricing for supermarkets and neighborhood groceries.',
    icon: ShoppingBasket,
    features: ['Weight-based items', 'Bulk & combo pricing', 'Expiry date tracking'],
    theme: {
      hue: 142,
      accent: '#15803d',
      accentSoft: '#dcfce7',
      accentFg: '#ffffff',
      chart: ['#15803d', '#22c55e', '#86efac'],
    },
    categories: ['Canned Goods', 'Beverages', 'Snacks', 'Fresh Produce', 'Household'],
    products: [
      p('Corned Beef 150g', 'Canned Goods', 42, '🥫', 80),
      p('Sardines (Tamilok) 155g', 'Canned Goods', 28, '🐟', 100),
      p('Canned Beans', 'Canned Goods', 35, '🥫', 60),
      p('Tuna Flakes 180g', 'Canned Goods', 55, '🐟', 45),
      p('Coke 1.5L', 'Beverages', 68, '🥤', 70),
      p('Mineral Water 1L', 'Beverages', 25, '💧', 120),
      p('Orange Juice 1L', 'Beverages', 95, '🧃', 35),
      p('Coffee 3-in-1 (10s)', 'Beverages', 88, '☕', 55),
      p('Piattos Ranch', 'Snacks', 42, '🍪', 90),
      p('Chippy Barbecue', 'Snacks', 35, '🍿', 95),
      p('Chocolate Bar', 'Snacks', 50, '🍫', 75),
      p('Spirals Pasta 500g', 'Snacks', 62, '🍝', 40),
      p('White Onions (kilo)', 'Fresh Produce', 78, '🧅', 30),
      p('Garlic (100g)', 'Fresh Produce', 45, '🧄', 35),
      p('Tomato (kilo)', 'Fresh Produce', 60, '🍅', 28),
      p('Egg (dozen)', 'Fresh Produce', 96, '🥚', 40),
      p('Dishwashing Liquid', 'Household', 55, '🧴', 50),
      p('Laundry Bar (3 pcs)', 'Household', 72, '🧼', 45),
    ],
  },
  {
    id: 'restaurant',
    name: 'Restaurant POS',
    tagline: 'Carinderias & full-service dining',
    description:
      'Table management, course timing, and split-bill checkout for Filipino restaurants, carinderias, and catered functions.',
    icon: UtensilsCrossed,
    features: ['Table & waiter assignment', 'Split bills & courses', 'Kitchen ticket mock'],
    theme: {
      hue: 350,
      accent: '#be123c',
      accentSoft: '#ffe4e6',
      accentFg: '#ffffff',
      chart: ['#be123c', '#f43f5e', '#fda4af'],
    },
    categories: ['Rice Meals', 'Pasta & Noodles', 'Soup & Salad', 'Drinks', 'Merienda'],
    products: [
      p('Chicken Adobo', 'Rice Meals', 120, '🍗', 40),
      p('Kare-Kare', 'Rice Meals', 165, '🥘', 25),
      p('Sinigang na Baboy', 'Rice Meals', 140, '🍲', 30),
      p('Bicol Express', 'Rice Meals', 130, '🌶️', 22),
      p('Crispy Pata', 'Rice Meals', 480, '🐷', 10),
      p('Pancit Canton', 'Pasta & Noodles', 95, '🍜', 45),
      p('Spaghetti Filipino Style', 'Pasta & Noodles', 89, '🍝', 35),
      p('Pancit Bihon', 'Pasta & Noodles', 90, '🍜', 40),
      p('Nilaga Soup', 'Soup & Salad', 110, '🍲', 20),
      p('Chicken Salad', 'Soup & Salad', 99, '🥗', 18),
      p('Caldo Verde', 'Soup & Salad', 105, '🥣', 15),
      p('Softdrinks 355ml', 'Drinks', 25, '🥤', 100),
      p('Bottled Water', 'Drinks', 20, '💧', 110),
      p('Iced Tea Pitcher', 'Drinks', 75, '🧋', 25),
      p('Halo-Halo Special', 'Merienda', 85, '🍧', 20),
      p('Turon', 'Merienda', 35, '🍠', 30),
      p('Bibingka', 'Merienda', 55, '🍰', 18),
      p('Puto & Kutsinta', 'Merienda', 45, '🍡', 22),
    ],
  },
  {
    id: 'cafe',
    name: 'Cafe POS',
    tagline: 'Coffee shops & milk tea bars',
    description:
      'Made-to-drink workflow with size and sweetness modifiers, pastry pairing, and loyalty tracking for cafes and milk tea shops.',
    icon: Coffee,
    features: ['Drink size & sugar levels', 'Barista order queue', 'Pastry pairing upsell'],
    theme: {
      hue: 28,
      accent: '#b45309',
      accentSoft: '#fef3c7',
      accentFg: '#ffffff',
      chart: ['#b45309', '#f59e0b', '#fcd34d'],
    },
    categories: ['Hot Coffee', 'Cold Coffee', 'Milk Tea', 'Pastries', 'Snacks'],
    products: [
      p('Americano', 'Hot Coffee', 95, '☕', 50),
      p('Cafe Latte', 'Hot Coffee', 120, '☕', 45),
      p('Cappuccino', 'Hot Coffee', 125, '☕', 45),
      p('Spanish Latte', 'Hot Coffee', 135, '☕', 40),
      p('Iced Americano', 'Cold Coffee', 110, '🧋', 55),
      p('Iced Caramel Macchiato', 'Cold Coffee', 150, '🧋', 40),
      p('Cold Brew', 'Cold Coffee', 140, '🧊', 30),
      p('Wintermelon Milk Tea', 'Milk Tea', 99, '🧋', 60),
      p('Taro Milk Tea', 'Milk Tea', 105, '🧋', 50),
      p('Matcha Milk Tea', 'Milk Tea', 110, '🍵', 40),
      p('Brown Sugar Boba', 'Milk Tea', 115, '🧋', 45),
      p('Butter Croissant', 'Pastries', 85, '🥐', 20),
      p('Cheesecake Slice', 'Pastries', 120, '🍰', 15),
      p('Chocolate Chip Cookie', 'Pastries', 55, '🍪', 30),
      p('Ensaymada', 'Pastries', 65, '🍞', 25),
      p('Ham & Cheese Sandwich', 'Snacks', 130, '🥪', 18),
      p('Clubhouse Sandwich', 'Snacks', 145, '🥪', 15),
      p('French Fries', 'Snacks', 99, '🍟', 25),
    ],
  },
  {
    id: 'pharmacy',
    name: 'Pharmacy POS',
    tagline: 'Drugstores & Botika ng Bayan',
    description:
      'Prescription and OTC dispensing with batch tracking, controlled-item logs, and senior/PWD discount handling for PH pharmacies.',
    icon: Cross,
    features: ['Rx & OTC separation', 'Senior/PWD discounts', 'Batch & expiry logs'],
    theme: {
      hue: 198,
      accent: '#0369a1',
      accentSoft: '#e0f2fe',
      accentFg: '#ffffff',
      chart: ['#0369a1', '#0ea5e9', '#7dd3fc'],
    },
    categories: ['Prescription', 'Pain Relievers', 'Vitamins', 'First Aid', 'Personal Care'],
    products: [
      p('Amoxicillin 500mg (Rx)', 'Prescription', 38, '💊', 40),
      p('Cefalexin 500mg (Rx)', 'Prescription', 62, '💊', 30),
      p('Insulin Pen (Rx)', 'Prescription', 420, '💉', 10),
      p('Metformin 500mg (Rx)', 'Prescription', 45, '💊', 35),
      p('Paracetamol 500mg (10s)', 'Pain Relievers', 12, '💊', 200),
      p('Ibuprofen 400mg (10s)', 'Pain Relievers', 22, '💊', 150),
      p('Mefenamic Acid (10s)', 'Pain Relievers', 18, '💊', 160),
      p('Ascorbic Acid 500mg', 'Vitamins', 15, '🍊', 180),
      p('Vitamin B Complex', 'Vitamins', 28, '💊', 120),
      p('Calcium + D3', 'Vitamins', 42, '🦴', 80),
      p('Alcohol 70% 500ml', 'First Aid', 55, '🧴', 60),
      p('Adhesive Bandages', 'First Aid', 32, '🩹', 90),
      p('Gauze Pads (5s)', 'First Aid', 25, '🩹', 70),
      p('Betadine 60ml', 'First Aid', 88, '🧴', 40),
      p('Hand Sanitizer 250ml', 'Personal Care', 65, '🧴', 55),
      p('Face Masks (10s)', 'Personal Care', 48, '😷', 100),
      p('Digital Thermometer', 'Personal Care', 180, '🌡️', 20),
      p('Surgical Mask Box (50)', 'Personal Care', 165, '😷', 25),
    ],
  },
  {
    id: 'general',
    name: 'General Merchandise POS',
    tagline: 'Department stores & ukay-ukay',
    description:
      'Multi-department catalog for mixed retail — from hardware to school supplies — with department-level sales reporting.',
    icon: Store,
    features: ['Multi-department catalog', 'Department sales rollups', 'Flexible SKU system'],
    theme: {
      hue: 217,
      accent: '#1d4ed8',
      accentSoft: '#dbeafe',
      accentFg: '#ffffff',
      chart: ['#1d4ed8', '#3b82f6', '#93c5fd'],
    },
    categories: ['Hardware', 'School Supplies', 'Toys', 'Pet Supplies', 'Auto Care'],
    products: [
      p('Hammer 16oz', 'Hardware', 220, '🔨', 25),
      p('Screwdriver Set', 'Hardware', 185, '🪛', 30),
      p('Tape Measure 5m', 'Hardware', 95, '📏', 40),
      p('Electric Drill', 'Hardware', 1250, '🛠️', 8),
      p('Nail Assortment', 'Hardware', 75, '📌', 50),
      p('Notebook A5 (80 leaves)', 'School Supplies', 65, '📓', 80),
      p('Ballpen (box of 10)', 'School Supplies', 120, '🖊️', 60),
      p('Art Paper (pack)', 'School Supplies', 45, '🎨', 70),
      p('Scientific Calculator', 'School Supplies', 385, '🧮', 15),
      p('School Bag', 'School Supplies', 499, '🎒', 20),
      p('Toy Robot', 'Toys', 350, '🤖', 12),
      p('Board Game', 'Toys', 420, '🎲', 10),
      p('Toy Car Set', 'Toys', 280, '🚗', 15),
      p('Plush Bear', 'Toys', 199, '🧸', 18),
      p('Dog Food 3kg', 'Pet Supplies', 320, '🐕', 20),
      p('Cat Litter 5kg', 'Pet Supplies', 275, '🐱', 15),
      p('Pet Leash', 'Pet Supplies', 150, '🦮', 22),
      p('Car Wax 500ml', 'Auto Care', 185, '🚗', 18),
      p('Tire Sealant', 'Auto Care', 210, '🛞', 14),
      p('Microfiber Cloths (3)', 'Auto Care', 95, '🧽', 30),
    ],
  },
]

export const POS_TYPE_MAP: Record<PosTypeId, PosTypeDef> = Object.fromEntries(
  POS_TYPES.map((t) => [t.id, t])
) as Record<PosTypeId, PosTypeDef>

export function getPosType(id: PosTypeId): PosTypeDef {
  return POS_TYPE_MAP[id] ?? POS_TYPES[0]
}

export function posTypeHue(id: PosTypeId): number {
  return getPosType(id).theme.hue
}
