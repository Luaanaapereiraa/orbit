import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installNativeDialog } from '../../test/native-dialog'
import { Dialog } from './Dialog'

function Harness({
  onClose,
  focusKey = 'form',
}: {
  onClose?: () => void
  focusKey?: string
}) {
  const [open, setOpen] = useState(true)

  return (
    <Dialog
      open={open}
      title="Estou travada"
      focusKey={focusKey}
      onClose={() => {
        onClose?.()
        setOpen(false)
      }}
    >
      <button type="button" data-initial-focus="">
        Primeiro
      </button>
    </Dialog>
  )
}

describe('Dialog native lifecycle', () => {
  beforeEach(() => {
    installNativeDialog()
  })

  afterEach(() => {
    cleanup()
  })

  it('does not call onClose or close the dialog when focusKey changes', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Dialog open title="Estou travada" focusKey="form" onClose={onClose}>
        <button type="button" data-initial-focus="">
          Primeiro
        </button>
      </Dialog>,
    )

    const node = document.querySelector('dialog')
    expect(node?.open).toBe(true)

    rerender(
      <Dialog
        open
        title="Estou travada"
        focusKey="submitting"
        onClose={onClose}
      >
        <button type="button" data-initial-focus="">
          Cancelar espera
        </button>
      </Dialog>,
    )

    expect(onClose).not.toHaveBeenCalled()
    expect(document.querySelector('dialog')?.open).toBe(true)
    expect(document.querySelectorAll('dialog')).toHaveLength(1)
  })

  it('moves focus to the marked control without dismissing', async () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Dialog open title="Estou travada" focusKey="form" onClose={onClose}>
        <button type="button">Outro</button>
        <button type="button" data-initial-focus="">
          Primeiro
        </button>
      </Dialog>,
    )

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Primeiro' })).toHaveFocus()
    })

    rerender(
      <Dialog
        open
        title="Usar este plano?"
        focusKey="confirm"
        onClose={onClose}
      >
        <button type="button">Cancelar</button>
        <button type="button" data-initial-focus="">
          Usar este plano
        </button>
      </Dialog>,
    )

    await vi.waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Usar este plano' }),
      ).toHaveFocus()
    })
    expect(onClose).not.toHaveBeenCalled()
    expect(document.querySelector('dialog')?.open).toBe(true)
  })

  it('calls onClose once from the close button', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Harness onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('calls onClose once from Escape', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Harness onClose={onClose} />)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose again when the parent sets open=false', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Dialog open title="Estou travada" onClose={onClose}>
        <p>conteudo</p>
      </Dialog>,
    )

    rerender(
      <Dialog open={false} title="Estou travada" onClose={onClose}>
        <p>conteudo</p>
      </Dialog>,
    )

    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not call onClose on unmount', () => {
    const onClose = vi.fn()
    const { unmount } = render(
      <Dialog open title="Estou travada" onClose={onClose}>
        <p>conteudo</p>
      </Dialog>,
    )

    unmount()
    expect(onClose).not.toHaveBeenCalled()
  })
})
