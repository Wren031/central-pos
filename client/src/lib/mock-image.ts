function hashHue(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) % 360
  }
  return hash
}

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function productImage(name: string, emoji: string): string {
  const hue = hashHue(name)
  const hue2 = (hue + 40) % 360
  const short = name.length > 18 ? `${name.slice(0, 17)}…` : name
  const safeName = short
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 70% 92%)"/>
      <stop offset="100%" stop-color="hsl(${hue2} 65% 84%)"/>
    </linearGradient>
  </defs>
  <rect width="320" height="200" fill="url(#g)"/>
  <circle cx="270" cy="30" r="60" fill="hsl(${hue} 70% 80%)" opacity="0.35"/>
  <circle cx="30" cy="180" r="46" fill="hsl(${hue2} 70% 78%)" opacity="0.3"/>
  <text x="160" y="104" font-size="64" text-anchor="middle">${emoji}</text>
  <text x="160" y="166" font-size="16" font-weight="600" text-anchor="middle" font-family="system-ui, sans-serif" fill="hsl(${hue} 45% 22%)">${safeName}</text>
</svg>`
  return svgToDataUri(svg)
}

export function fileToProductImage(file: File, maxSize = 480): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file (PNG, JPG, WebP or GIF).'))
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      reject(new Error('That image is too large (max 12 MB). Please choose a smaller one.'))
      return
    }

    const url = URL.createObjectURL(file)
    const img = new Image()
    let settled = false

    const fail = (message: string) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      reject(new Error(message))
    }
    const finish = (dataUrl: string) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      resolve(dataUrl)
    }

    // A decode that never fires onload/onerror (corrupt or unsupported file)
    // must not leave the UI stuck on "Processing image…".
    const timer = setTimeout(
      () => fail('That image could not be processed. Try a different file.'),
      15000
    )

    img.onload = () => {
      // Everything below can throw (decode/OOM/encode) — always settle.
      try {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          clearTimeout(timer)
          fail('This device could not process the image.')
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        let dataUrl = canvas.toDataURL('image/jpeg', 0.78)
        // Re-encode smaller if the result is still heavy for local storage.
        if (dataUrl.length > 400_000) dataUrl = canvas.toDataURL('image/jpeg', 0.6)
        clearTimeout(timer)
        finish(dataUrl)
      } catch {
        clearTimeout(timer)
        fail('That image could not be processed. Try a different file.')
      }
    }
    img.onerror = () => {
      clearTimeout(timer)
      // HEIC and other formats a browser cannot decode land here.
      fail('That image format is not supported. Please use a PNG, JPG or WebP.')
    }
    img.src = url
  })
}

export function logoImage(label: string, colorHue = 25): string {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  const hue = Number.isFinite(colorHue) ? colorHue : hashHue(label)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="22" fill="hsl(${hue} 62% 42%)"/>
  <text x="48" y="60" font-size="36" font-weight="700" text-anchor="middle" font-family="system-ui, sans-serif" fill="#fff">${initials || 'PS'}</text>
</svg>`
  return svgToDataUri(svg)
}

export function avatarImage(name: string): string {
  return logoImage(name, 220)
}
