'use client'

import {
  type ReactNode,
  type RefObject,
  useId,
  useLayoutEffect,
  useRef,
} from 'react'
import { cn } from '../../lib/cn'

interface DialogProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
  initialFocusRef?: RefObject<{ focus: () => void } | null>
}

export function Dialog({
  open,
  title,
  onClose,
  children,
  className,
  initialFocusRef,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useLayoutEffect(() => {
    const node = dialogRef.current

    if (!open || !node) {
      return
    }

    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    if (typeof node.showModal === 'function') {
      try {
        if (!node.open) {
          node.showModal()
        }
      } catch {
        node.setAttribute('open', '')
      }
    } else {
      node.setAttribute('open', '')
    }

    const focusTarget = initialFocusRef?.current ?? node
    focusTarget.focus()

    return () => {
      if (typeof node.close === 'function' && node.open) {
        node.close()
      }

      previous?.focus?.()
    }
  }, [initialFocusRef, open])

  if (!open) {
    return null
  }

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      className={cn(
        'w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-panel p-0 text-ink shadow-xl backdrop:bg-ink/40 dark:border-line-dark dark:bg-panel-dark dark:text-ink-dark',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 dark:border-line-dark">
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-muted transition hover:bg-line hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none dark:text-muted-dark dark:hover:bg-line-dark dark:hover:text-ink-dark"
          aria-label="Fechar"
        >
          ×
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  )
}
