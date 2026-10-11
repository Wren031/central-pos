import * as React from 'react'
import type { OrderItem, Product } from '@/lib/types'

interface CartValue {
  items: (OrderItem & { maxStock: number })[]
  count: number
  subtotal: number
  add: (product: Product) => void
  increment: (productId: string) => void
  decrement: (productId: string) => void
  remove: (productId: string) => void
  clear: () => void
}

const CartContext = React.createContext<CartValue | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<(OrderItem & { maxStock: number })[]>([])

  const add = React.useCallback((product: Product) => {
    setItems((prev) => {
      const existing = prev.find((it) => it.productId === product.id)
      if (existing) {
        if (existing.qty >= product.stock) return prev
        return prev.map((it) =>
          it.productId === product.id ? { ...it, qty: it.qty + 1 } : it
        )
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          qty: 1,
          maxStock: product.stock,
        },
      ]
    })
  }, [])

  const increment = React.useCallback((productId: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.productId === productId && it.qty < it.maxStock ? { ...it, qty: it.qty + 1 } : it
      )
    )
  }, [])

  const decrement = React.useCallback((productId: string) => {
    setItems((prev) =>
      prev.flatMap((it) =>
        it.productId === productId ? (it.qty <= 1 ? [] : [{ ...it, qty: it.qty - 1 }]) : [it]
      )
    )
  }, [])

  const remove = React.useCallback((productId: string) => {
    setItems((prev) => prev.filter((it) => it.productId !== productId))
  }, [])

  const clear = React.useCallback(() => setItems([]), [])

  const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0)
  const count = items.reduce((s, it) => s + it.qty, 0)

  const value = React.useMemo(
    () => ({ items, count, subtotal, add, increment, decrement, remove, clear }),
    [items, count, subtotal, add, increment, decrement, remove, clear]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartValue {
  const ctx = React.useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
