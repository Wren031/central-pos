import { cn } from 'cn'
import logoUrl from '@/assets/logo.png'

/**
 * UniPOS wordmark.
 *
 * The source image already contains the "UniPOS" text, so it renders on its
 * own — callers should not add an adjacent text label. Height is set per call
 * site with `w-auto` preserving the 676x369 aspect ratio.
 *
 * Pass `alt=""` when the logo sits inside a link that already has an
 * `aria-label` (otherwise screen readers announce the name twice).
 */
export function BrandLogo({
  className,
  alt = 'UniPOS',
}: {
  className?: string
  alt?: string
}) {
  return (
    <img
      src={logoUrl}
      alt={alt}
      draggable={false}
      decoding="async"
      className={cn('w-auto select-none object-contain', className)}
    />
  )
}
