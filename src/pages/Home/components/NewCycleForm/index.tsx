import { useFormContext } from 'react-hook-form'
import { useCycles } from '../../../../contexts/CyclesContext'
import { FormContainer, MinutesAmountInput, TaskInput } from './styles'

export function NewCycleForm() {
  const { activeCycle, cycles } = useCycles()
  const { register } = useFormContext()

  const taskSuggestions = Array.from(
    new Set(cycles.map((cycle) => cycle.task).filter(Boolean)),
  )

  return (
    <FormContainer>
      <label htmlFor="task">Vou trabalhar em</label>
      <TaskInput
        id="task"
        list="task-suggestions"
        placeholder="Dê um nome para o seu projeto"
        disabled={!!activeCycle}
        autoComplete="off"
        {...register('task')}
      />
      <datalist id="task-suggestions">
        {taskSuggestions.map((task) => (
          <option key={task} value={task} />
        ))}
      </datalist>

      <label htmlFor="minutesAmount">durante</label>
      <MinutesAmountInput
        type="number"
        id="minutesAmount"
        placeholder="00"
        step={5}
        min={5}
        max={60}
        disabled={!!activeCycle}
        {...register('minutesAmount', { valueAsNumber: true })}
      />

      <span>minutos.</span>
    </FormContainer>
  )
}
