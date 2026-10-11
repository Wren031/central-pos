import * as React from 'react'
import { Link } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertTriangle,
  ImagePlus,
  Loader2,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
import { EmptyState } from '@/components/common/empty-state'
import { peso } from '@/lib/format'
import { fileToProductImage, productImage } from '@/lib/mock-image'
import { getPosType } from '@/lib/pos-types'
import { addProduct, deleteProduct, getProducts, updateProduct } from '@/lib/repos'
import type { Product } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuth } from '@/state/auth-context'
import { useSubscription } from '@/state/subscription-context'
import { AdjustStockDialog } from './adjust-stock-dialog'

const schema = z.object({
  name: z.string().min(2, 'Product name is required.'),
  category: z.string().min(1, 'Pick a category.'),
  price: z.number().min(0.01, 'Price must be greater than 0.'),
  stock: z.number().int('Stock must be a whole number.').min(0, 'Cannot be negative.'),
  image: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

function ProductDialog({
  open,
  onOpenChange,
  product,
  categories,
  storeId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  product: Product | null
  categories: string[]
  storeId: string
  onSaved: () => void
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', category: categories[0] ?? '', price: 0, stock: 0, image: '' },
  })

  const fileRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      if (product) {
        form.reset({
          name: product.name,
          category: product.category,
          price: product.price,
          stock: product.stock,
          image: product.image ?? '',
        })
      } else {
        form.reset({ name: '', category: categories[0] ?? '', price: 0, stock: 0, image: '' })
      }
    }
  }, [open, product, categories, form])

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const src = await fileToProductImage(file)
      form.setValue('image', src, { shouldDirty: true })
      toast.success('Image added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read image.')
    } finally {
      setUploading(false)
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void handleFile(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  async function onSubmit(values: FormValues) {
    try {
      if (product) {
        await updateProduct(product.id, { ...values, image: values.image || undefined })
        toast.success('Product updated')
      } else {
        await addProduct(storeId, { ...values, emoji: '📦', image: values.image || undefined })
        toast.success('Product added')
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save product.')
    }
  }

  const nameValue = form.watch('name')
  const imageValue = form.watch('image')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent showCloseButton={false} side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="relative shrink-0 border-b px-4 py-3.5 pr-12 sm:px-6">
          <SheetTitle>{product ? 'Edit product' : 'Add product'}</SheetTitle>
          <SheetDescription>
            {product
              ? 'Update details, image, and stock levels.'
              : 'Add an item to your catalog. It will appear on the Sell screen.'}
          </SheetDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-3 right-3"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
          </Button>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <Form {...form} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="image"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Product image</FormLabel>
                    <span className="text-[11px] text-muted-foreground">PNG or JPG · drag & drop supported</span>
                  </div>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDragOver(true)
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    className={cn(
                      'relative aspect-[16/7] w-full overflow-hidden rounded-xl border-2 border-dashed bg-muted/30 transition-colors',
                      dragOver && 'border-primary bg-primary/5'
                    )}
                  >
                    <img
                      src={imageValue || productImage(nameValue || 'Product', '📦')}
                      alt=""
                      className={cn(
                        'absolute inset-0 size-full object-cover transition-all',
                        imageValue ? '' : 'opacity-60'
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="group absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/45 text-white opacity-0 transition-opacity focus-visible:opacity-100 hover:opacity-100"
                      aria-label={imageValue ? 'Change product image' : 'Choose product image'}
                    >
                      {uploading ? (
                        <Loader2 className="size-6 animate-spin" aria-hidden />
                      ) : (
                        <ImagePlus className="size-6" aria-hidden />
                      )}
                      <span className="text-sm font-medium">
                        {uploading ? 'Processing image…' : imageValue ? 'Click to change image' : 'Click to browse or drop an image'}
                      </span>
                      <span className="text-xs text-white/75">Recommended 4:3 · max 480px</span>
                    </button>
                    {imageValue && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="absolute top-2 right-2 shadow-sm"
                        onClick={() => field.onChange('')}
                      >
                        <X className="size-3.5" /> Remove
                      </Button>
                    )}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      aria-label="Choose product image"
                      onChange={onPickFile}
                    />
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-1.5">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Details</p>
              <div className="space-y-4 rounded-xl border bg-muted/20 p-3.5">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product name</FormLabel>
                      <FormControl>
                        <Input placeholder="Chicken Inasal" autoFocus={!product} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Pricing &amp; stock</p>
              <div className="grid gap-4 rounded-xl border bg-muted/20 p-3.5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Selling price</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                            ₱
                          </span>
                          <Input
                            inputMode="decimal"
                            placeholder="0.00"
                            className="pl-7 tabular-nums"
                            value={field.value ? String(field.value) : ''}
                            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          />
                        </div>
                      </FormControl>
                      <p className="text-[11px] text-muted-foreground">Price per item at checkout.</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="stock"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stock on hand</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            inputMode="numeric"
                            placeholder="0"
                            className="pr-14 tabular-nums"
                            value={String(field.value)}
                            onChange={(e) => field.onChange(Math.floor(Number(e.target.value) || 0))}
                          />
                          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                            units
                          </span>
                        </div>
                      </FormControl>
                      <p className="text-[11px] text-muted-foreground">Low-stock alert at 10 or fewer.</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t bg-background px-4 pt-3 pb-3 sm:-mx-6 sm:px-6 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting || uploading}>
                {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
                {product ? 'Save changes' : 'Add to catalog'}
              </Button>
            </div>
          </Form>
          </div>
      </SheetContent>
    </Sheet>
  )
}

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

  React.useEffect(() => {
    refresh()
    const handler = () => refresh()
    window.addEventListener('cpos:data-changed', handler)
    return () => window.removeEventListener('cpos:data-changed', handler)
  }, [refresh])

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

  const posDef = getPosType(store.posType)
  const filtered = (products ?? []).filter((p) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
  })
  const totalValue = (products ?? []).reduce((s, p) => s + p.price * p.stock, 0)
  const lowCount = (products ?? []).filter((p) => p.stock <= 10).length

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
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="hidden sm:table-cell">SKU</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
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
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                    {p.sku}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="secondary">{p.category}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{peso(p.price)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={p.stock === 0 ? 'destructive' : p.stock <= 10 ? 'outline' : 'secondary'} className="tabular-nums">
                      {p.stock}
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
        categories={posDef.categories}
        storeId={store.id}
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
