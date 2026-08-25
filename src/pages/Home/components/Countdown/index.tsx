import { useCycles } from '../../../../contexts/CyclesContext'
import {
  CountdownContainer,
  CountdownWrapper,
  ProgressBar,
  Separator,
} from './styles'

export function Countdown() {
  const { activeCycle, amountSecondsPassed } = useCycles()

  const totalSeconds = activeCycle ? activeCycle.minutesAmount * 60 : 0
  const currentSeconds = activeCycle
    ? Math.max(totalSeconds - amountSecondsPassed, 0)
    : 0

  const minutesAmount = Math.floor(currentSeconds / 60)
  const secondsAmount = currentSeconds % 60

  const minutes = String(minutesAmount).padStart(2, '0')
  const seconds = String(secondsAmount).padStart(2, '0')

  const progress =
    activeCycle && totalSeconds > 0
      ? Math.min((amountSecondsPassed / totalSeconds) * 100, 100)
      : 0

  return (
    <CountdownWrapper>
      <CountdownContainer aria-live="polite" aria-label={`${minutes}:${seconds}`}>
        <span>{minutes[0]}</span>
        <span>{minutes[1]}</span>
        <Separator>:</Separator>
        <span>{seconds[0]}</span>
        <span>{seconds[1]}</span>
      </CountdownContainer>
      <ProgressBar
        $progress={progress}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      />
    </CountdownWrapper>
  )
}
