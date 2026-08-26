import { usePomodoro } from '../../contexts/PomodoroContext'
import { Card } from '../../components/ui/Card'
import { Toggle } from '../../components/ui/Toggle'

export function Settings() {
  const { settings, updateSettings } = usePomodoro()

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold text-ink dark:text-ink-dark">
        Configurações
      </h1>

      <Card className="space-y-5">
        <h2 className="font-bold text-ink dark:text-ink-dark">Durações</h2>
        <NumberField
          label="Foco (minutos)"
          value={settings.focusMinutes}
          min={5}
          max={60}
          onChange={(focusMinutes) => updateSettings({ focusMinutes })}
        />
        <NumberField
          label="Pausa curta (minutos)"
          value={settings.shortBreakMinutes}
          min={1}
          max={30}
          onChange={(shortBreakMinutes) =>
            updateSettings({ shortBreakMinutes })
          }
        />
        <NumberField
          label="Pausa longa (minutos)"
          value={settings.longBreakMinutes}
          min={5}
          max={60}
          onChange={(longBreakMinutes) => updateSettings({ longBreakMinutes })}
        />
        <NumberField
          label="Ciclos até a pausa longa"
          value={settings.cyclesUntilLongBreak}
          min={1}
          max={12}
          onChange={(cyclesUntilLongBreak) =>
            updateSettings({ cyclesUntilLongBreak })
          }
        />
      </Card>

      <Card className="space-y-2">
        <h2 className="mb-2 font-bold text-ink dark:text-ink-dark">
          Preferências
        </h2>
        <Toggle
          label="Iniciar pausas automaticamente"
          checked={settings.autoStartBreaks}
          onClick={() =>
            updateSettings({ autoStartBreaks: !settings.autoStartBreaks })
          }
        />
        <Toggle
          label="Som ao concluir ciclo"
          checked={settings.soundEnabled}
          onClick={() =>
            updateSettings({ soundEnabled: !settings.soundEnabled })
          }
        />
        <Toggle
          label="Notificações do navegador"
          checked={settings.notificationsEnabled}
          onClick={() =>
            updateSettings({
              notificationsEnabled: !settings.notificationsEnabled,
            })
          }
        />
        <Toggle
          label="Tema escuro"
          checked={settings.theme === 'dark'}
          onClick={() =>
            updateSettings({
              theme: settings.theme === 'dark' ? 'light' : 'dark',
            })
          }
        />
      </Card>
    </div>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-center justify-between text-sm font-medium text-ink dark:text-ink-dark">
        {label}
        <strong>{value}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-brand"
      />
    </label>
  )
}
