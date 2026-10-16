import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
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
import { addProduct, updateProduct } from '@/lib/repos'
import { fileToProductImage, productImage } from '@/lib/mock-image'
import { DEFAULT_UNIT, PRODUCT_UNITS, unitLabel } from '@/lib/units'
import type { Product } from '@/lib/types'
import { cn } from '@/lib/utils'

const schema = z.object({
  name: z.string().min(2, 'Product name is required.'),
  category: z.string().min(1, 'Pick a category.'),
  price: z.number().min(0.01, 'Price must be greater than 0.'),
  stock: z.number().int('Stock must be a whole number.').min(0, 'Cannot be negative.'),
  unit: z.string(),
  image: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

/**
 * Add / edit a product, including its image — used by the Inventory screen.
 *
 * The form is reset ONLY when the sheet opens or the edited product changes —
 * NOT when the parent re-renders. A background cache emit (auth/subscription
 * refresh) re-renders the parent constantly; keying the reset on a freshly
 * created `categories` array previously wiped a just-added image (and the
 * typed fields) mid-edit.
 */
export function ProductDialog({
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
  onSaved?: () => void
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      category: '',
      price: 0,
      stock: 0,
      unit: DEFAULT_UNIT,
      image: '',
    },
  })

  const fileRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  const [imageError, setImageError] = React.useState<string | null>(null)
  const [dragOver, setDragOver] = React.useState(false)

  // Reset once per (open, product) — see the note above.
  const resetKey = `${open ? 'o' : 'c'}:${product?.id ?? 'new'}`
  const lastResetKey = React.useRef<string | null>(null)
  const categoriesRef = React.useRef(categories)
  categoriesRef.current = categories

  React.useEffect(() => {
    if (!open) return
    if (lastResetKey.current === resetKey) return
    lastResetKey.current = resetKey
    setImageError(null)
    setUploading(false)
    if (product) {
      form.reset({
        name: product.name,
        category: product.category,
        price: product.price,
        stock: product.stock,
        unit: product.unit ?? DEFAULT_UNIT,
        image: product.image ?? '',
      })
    } else {
      form.reset({
        name: '',
        category: categoriesRef.current[0] ?? '',
        price: 0,
        stock: 0,
        unit: DEFAULT_UNIT,
        image: '',
      })
    }
  }, [open, product, resetKey, form])

  // If categories arrive after the sheet opened and none is chosen yet, fill in
  // a sensible default WITHOUT resetting the rest of the form.
  React.useEffect(() => {
    if (!open || product) return
    if (form.getValues('category')) return
    if (categories.length > 0) form.setValue('category', categories[0])
  }, [open, product, categories, form])

  async function handleFile(file: File) {
    setUploading(true)
    setImageError(null)
    try {
      const src = await fileToProductImage(file)
      form.setValue('image', src, { shouldDirty: true })
      toast.success('Image added')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read image.'
      setImageError(message)
      toast.error(message)
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
      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save product.')
    }
  }

  const nameValue = form.watch('name')
  const imageValue = form.watch('image')
  const unitValue = form.watch('unit')

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
                    <span className="text-[11px] text-muted-foreground">
                      PNG, JPG or WebP
                    </span>
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
                    {imageValue && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="absolute top-2 right-2 z-10 shadow-sm"
                        onClick={() => field.onChange('')}
                      >
                        <X className="size-3.5" /> Remove
                      </Button>
                    )}
                  </div>

                  {/* Always-visible control: a native <label> wrapping an
                      sr-only input is reliable on desktop AND touch (the old
                      invisible hover overlay gave no way to add an image). */}
                  <label
                    className={cn(
                      'flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted/40',
                      uploading && 'pointer-events-none opacity-70'
                    )}
                  >
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <ImagePlus className="size-4" aria-hidden />
                    )}
                    {uploading
                      ? 'Processing image…'
                      : imageValue
                        ? 'Change image'
                        : 'Add image'}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="sr-only"
                      aria-label="Choose product image"
                      onChange={onPickFile}
                    />
                  </label>
                  {imageError && (
                    <p role="alert" className="text-xs font-medium text-destructive">
                      {imageError}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-1.5">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Details
              </p>
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
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Pricing &amp; stock
              </p>
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
                      <p className="text-[11px] text-muted-foreground">
                        Price per {unitLabel(unitValue)} at checkout.
                      </p>
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
                            className="pr-16 tabular-nums"
                            value={String(field.value)}
                            onChange={(e) => field.onChange(Math.floor(Number(e.target.value) || 0))}
                          />
                          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                            {unitLabel(unitValue)}
                          </span>
                        </div>
                      </FormControl>
                      <p className="text-[11px] text-muted-foreground">Low-stock alert at 10 or fewer.</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Unit of measure</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PRODUCT_UNITS.map((u) => (
                            <SelectItem key={u} value={u}>
                              {u}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        How this item is counted — applied to pricing and stock (pc, bottle, kg…).
                      </p>
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
