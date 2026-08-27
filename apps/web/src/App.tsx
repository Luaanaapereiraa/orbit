import { BrowserRouter } from 'react-router-dom'
import { Router } from './Router'
import { PomodoroProvider } from './contexts/PomodoroContext'

export function App() {
  return (
    <BrowserRouter>
      <PomodoroProvider>
        <Router />
      </PomodoroProvider>
    </BrowserRouter>
  )
}
