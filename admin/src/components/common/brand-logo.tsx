import { cn } from 'cn'
import logoUrl from '@/assets/logo.png'

/**
 * UniPOS wordmark.
 *
 * The source image already contains the "UniPOS" text, so it renders on its
 * own — callers should not add an adjacent text label. Height is set per call
 * site; `w-auto` preserves the 676x369 aspect ratio.
 *
 * The asset is a dark navy wordmark on a transparent background
 * (avg RGB 39,61,88), so on the app's dark surfaces it needs `tone="mono"`,
 * which renders it white via a brightness/invert filter. Use the default
 * `tone="original"` only on a light background.
 *
 * Pass `alt=""` when the logo sits inside a link or heading that already names
 * the product, otherwise screen readers announce the name twice.
 */
export function BrandLogo({
  className,
  alt = 'UniPOS',
  tone = 'original',
}: {
  className?: string
  alt?: string
  tone?: 'original' | 'mono'
}) {
  return (
    <img
      src={logoUrl}
      alt={alt}
      draggable={false}
      decoding="async"
      className={cn(
        'w-auto select-none object-contain',
        tone === 'mono' && 'brightness-0 invert',
        className
      )}
    />
  )
}
