'use client'

import { type ReactNode, type RefObject, useEffect, useId, useRef } from 'react'
import { cn } from '../../lib/cn'

interface DialogProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  className?: string
  initialFocusRef?: RefObject<{ focus: () => void } | null>
  focusKey?: string
}

function openNativeDialog(dialog: HTMLDialogElement) {
  if (dialog.open) {
    return
  }

  if (typeof dialog.showModal === 'function') {
    try {
      dialog.showModal()
      return
    } catch {
      dialog.setAttribute('open', '')
      return
    }
  }

  dialog.setAttribute('open', '')
}

function closeNativeDialog(dialog: HTMLDialogElement) {
  if (!dialog.open) {
    return
  }

  if (typeof dialog.close === 'function') {
    dialog.close()
    return
  }

  dialog.removeAttribute('open')
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  className,
  initialFocusRef,
  focusKey,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const programmaticCloseRef = useRef(false)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) {
      return
    }

    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    openNativeDialog(dialog)

    return () => {
      programmaticCloseRef.current = true
      closeNativeDialog(dialog)
      queueMicrotask(() => {
        programmaticCloseRef.current = false
      })
      previous?.focus?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    function focusUsefulControl() {
      const marked = dialog.querySelector<HTMLElement>('[data-initial-focus]')
      const body = dialog.querySelector<HTMLElement>('[data-dialog-body]')
      const firstUseful =
        marked ??
        body?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
      const focusTarget = initialFocusRef?.current ?? firstUseful
      if (focusTarget) {
        focusTarget.focus()
      }
    }

    focusUsefulControl()
    const frame = window.requestAnimationFrame(focusUsefulControl)
    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [focusKey, initialFocusRef, open])

  function requestClose() {
    onClose()
  }

  function handleNativeClose() {
    if (programmaticCloseRef.current) {
      return
    }
    onClose()
  }

  if (!open) {
    return null
  }

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={handleNativeClose}
      onCancel={(event) => {
        event.preventDefault()
        requestClose()
      }}
      className={cn(
        'm-auto w-[min(36rem,calc(100vw-2rem))] rounded-2xl border border-line bg-panel p-0 text-ink shadow-xl backdrop:bg-ink/40 dark:border-line-dark dark:bg-panel-dark dark:text-ink-dark',
        'max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:mb-0 max-md:w-full max-md:max-w-none max-md:rounded-t-3xl max-md:rounded-b-none',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 dark:border-line-dark">
        <div>
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          {description ? (
            <p
              id={descriptionId}
              className="mt-1 text-sm text-muted dark:text-muted-dark"
            >
              {description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={requestClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-line hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none dark:text-muted-dark dark:hover:bg-line-dark dark:hover:text-ink-dark"
          aria-label="Fechar"
        >
          ×
        </button>
      </div>
      <div
        data-dialog-body
        className="max-h-[min(70vh,36rem)] overflow-y-auto overflow-x-hidden px-5 py-4"
      >
        {children}
      </div>
      {footer ? (
        <div className="sticky bottom-0 border-t border-line bg-panel px-5 py-4 dark:border-line-dark dark:bg-panel-dark">
          {footer}
        </div>
      ) : null}
    </dialog>
  )
}
