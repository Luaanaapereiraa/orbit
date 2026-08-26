import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '../components/ui/Button'
import { Toggle } from '../components/ui/Toggle'

describe('Button', () => {
  it('renders the label and can be disabled', () => {
    render(
      <Button disabled variant="danger">
        Interromper
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Interromper' })
    expect(button).toBeDisabled()
  })
})

describe('Toggle', () => {
  it('exposes checked state to assistive tech', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    const { rerender } = render(
      <Toggle label="Som ao concluir ciclo" checked={false} onClick={onClick} />,
    )

    const toggle = screen.getByRole('switch', {
      name: 'Som ao concluir ciclo',
    })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    await user.click(toggle)
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(
      <Toggle label="Som ao concluir ciclo" checked onClick={onClick} />,
    )
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })
})
