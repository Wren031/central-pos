import * as React from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Package, PackagePlus, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DataPagination } from '@/components/common/data-pagination'
import { EmptyState } from '@/components/common/empty-state'
import { peso } from '@/lib/format'
import { productImage } from '@/lib/mock-image'
import { formatQty } from '@/lib/units'
import { getCategories, deleteProduct, getProducts } from '@/lib/repos'
import { getPosType } from '@/lib/pos-types'
import type { Product } from '@/lib/types'
import { usePagination } from '@/hooks/use-pagination'
import { useAuth } from '@/state/auth-context'
import { useSubscription } from '@/state/subscription-context'
import { AdjustStockDialog } from './adjust-stock-dialog'
import { ProductDialog } from './product-dialog'

export function InventoryPage() {
  const { store } = useAuth()
  const { state } = useSubscription()
  const [products, setProducts] = React.useState<Product[] | null>(null)
  const [query, setQuery] = React.useState('')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Product | null>(null)
  const [deleting, setDeleting] = React.useState<Product | null>(null)
  const [adjusting, setAdjusting] = React.useState<Product | null>(null)

  const refresh = React.useCallback(() => {
    if (!store) return
    setProducts(getProducts(store.id))
  }, [store])

  // Stable identity across unrelated re-renders (a new array every render would
  // be passed straight into the dialog's effect deps).
  const categories = React.useMemo(
    () => (store ? getCategories(store.id).map((c) => c.name) : []),
    // Refresh when the product list changes (i.e. after a data-changed emit).
    [store, products]
  )

  React.useEffect(() => {
    refresh()
    const handler = () => refresh()
    window.addEventListener('cpos:data-changed', handler)
    return () => window.removeEventListener('cpos:data-changed', handler)
  }, [refresh])

  const barcodeEnabled = store ? getPosType(store.posType).barcodeEnabled : false

  const filtered = (products ?? []).filter((p) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.barcode?.toLowerCase().includes(q) ?? false)
    )
  })
  const totalValue = (products ?? []).reduce((s, p) => s + p.price * p.stock, 0)
  const lowCount = (products ?? []).filter((p) => p.stock <= 10).length
  // A new search term restarts at page 1; a data refresh does not move the page.
  const pagination = usePagination(filtered, { resetKey: query })

  if (!store) {
    return (
      <div className="w-full p-4 sm:p-6">
        <EmptyState
          icon={Package}
          title="No store configured"
          description="Choose a POS type first."
          action={
            <Button asChild>
              <Link to="/onboarding">Set up POS</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="w-full space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            {products?.length ?? '—'} products · stock value {peso(totalValue)}
            {lowCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-600">
                <AlertTriangle className="size-3.5" aria-hidden />
                {lowCount} low stock
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search inventory…"
              className="pl-9"
              aria-label="Search inventory"
            />
          </div>
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      </div>

      {products === null ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products found"
          description={query ? 'Try a different search.' : 'Add your first product to the catalog.'}
          action={
            !query && (
              <Button
                onClick={() => {
                  setEditing(null)
                  setDialogOpen(true)
                }}
              >
                <Plus className="size-4" /> Add product
              </Button>
            )
          }
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden sm:table-cell">SKU</TableHead>
                  {barcodeEnabled && (
                    <TableHead className="hidden lg:table-cell">Barcode</TableHead>
                  )}
                  <TableHead className="hidden md:table-cell">Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.pageItems.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <span className="flex items-center gap-2.5">
                        <img
                          src={p.image || productImage(p.name, p.emoji)}
                          alt=""
                          className="size-9 shrink-0 rounded-lg border object-cover"
                          loading="lazy"
                        />
                        <span>
                          <span className="block font-medium">{p.name}</span>
                          <span className="block text-xs text-muted-foreground sm:hidden">{p.sku}</span>
                          {barcodeEnabled && p.barcode && (
                            <span className="block font-mono text-[11px] text-muted-foreground lg:hidden">
                              {p.barcode}
                            </span>
                          )}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                      {p.sku}
                    </TableCell>
                    {barcodeEnabled && (
                      <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                        {p.barcode || '—'}
                      </TableCell>
                    )}
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary">{p.category}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{peso(p.price)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={p.stock === 0 ? 'destructive' : p.stock <= 10 ? 'outline' : 'secondary'} className="tabular-nums">
                        {formatQty(p.stock, p.unit)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setAdjusting(p)}
                          aria-label={`Adjust stock for ${p.name}`}
                        >
                          <PackagePlus className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => {
                            setEditing(p)
                            setDialogOpen(true)
                          }}
                          aria-label={`Edit ${p.name}`}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleting(p)}
                          aria-label={`Delete ${p.name}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DataPagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalPages={pagination.totalPages}
            total={pagination.total}
            from={pagination.from}
            to={pagination.to}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            itemLabel="products"
          />
        </div>
      )}

      {!state.canSell && (
        <p className="text-xs text-muted-foreground">
          You can edit inventory while your subscription is expired — sales resume after renewal.
        </p>
      )}

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editing}
        categories={categories}
        storeId={store.id}
        barcodeEnabled={barcodeEnabled}
        onSaved={refresh}
      />

      <AdjustStockDialog
        product={adjusting}
        onOpenChange={(o) => !o && setAdjusting(null)}
        onAdjusted={refresh}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the product from your catalog. Past orders keep their records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleting) return
                await deleteProduct(deleting.id)
                toast.success('Product deleted')
                setDeleting(null)
                refresh()
              }}
            >
              Delete product
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
