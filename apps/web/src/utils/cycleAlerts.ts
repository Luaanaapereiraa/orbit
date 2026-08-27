let audioContext: AudioContext | null = null

function getAudioContext() {
  if (audioContext) {
    return audioContext
  }

  const AudioContextClass =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext

  if (!AudioContextClass) {
    return null
  }

  audioContext = new AudioContextClass()
  return audioContext
}

export function unlockAudio() {
  const context = getAudioContext()

  if (context?.state === 'suspended') {
    context.resume()
  }
}

export function playFinishSound() {
  const context = getAudioContext()

  if (!context) {
    return
  }

  if (context.state === 'suspended') {
    context.resume()
  }

  const now = context.currentTime

  ;[
    { frequency: 523.25, start: 0, duration: 0.16 },
    { frequency: 659.25, start: 0.14, duration: 0.16 },
    { frequency: 783.99, start: 0.28, duration: 0.28 },
  ].forEach(({ frequency, start, duration }) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    oscillator.connect(gain)
    gain.connect(context.destination)

    gain.gain.setValueAtTime(0, now + start)
    gain.gain.linearRampToValueAtTime(0.08, now + start + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration)

    oscillator.start(now + start)
    oscillator.stop(now + start + duration)
  })
}

export function notifyCycleFinished(
  task: string,
  type: 'focus' | 'shortBreak' | 'longBreak' = 'focus',
) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return
  }

  const isFocus = type === 'focus'
  const notification = new Notification(
    isFocus ? 'Foco concluído' : 'Pausa concluída',
    {
      body: isFocus
        ? `A tarefa “${task}” foi finalizada. Hora de uma pausa!`
        : 'Pausa encerrada. Bora focar de novo?',
    },
  )

  notification.onclick = () => {
    window.focus()
    notification.close()
  }
}

export function requestNotificationPermission() {
  if (!('Notification' in window) || Notification.permission !== 'default') {
    return
  }

  Notification.requestPermission()
}
