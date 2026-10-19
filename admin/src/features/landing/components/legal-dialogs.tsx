import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from '../site'

export function LegalDialogs({
  doc,
  onClose,
}: {
  doc: 'privacy' | 'terms' | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={doc !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="landing-surface max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{doc === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
              {doc === 'privacy' ? PRIVACY_POLICY : TERMS_OF_SERVICE}
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
