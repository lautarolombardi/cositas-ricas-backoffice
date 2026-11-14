import { useLayoutEffect, useRef } from 'react'
import { Toaster as SonnerToaster, useSonner } from 'sonner'

export function Toaster() {
  const regionRef = useRef<HTMLDivElement>(null)
  const newestId = useSonner().toasts[0]?.id

  // Sonner renders outside the top layer, so a modal <dialog> would cover it.
  // Re-entering the top layer on every new toast keeps it above any dialog.
  // The region must stay open: Sonner measures each toast's height on mount,
  // and a closed popover (display: none) measures as 0.
  useLayoutEffect(() => {
    const region = regionRef.current
    if (!region) return
    if (region.matches(':popover-open')) region.hidePopover()
    region.showPopover()
  }, [newestId])

  return (
    <div ref={regionRef} popover="manual" className="toast-region">
      <SonnerToaster position="bottom-right" closeButton />
    </div>
  )
}
