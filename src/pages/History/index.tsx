import { formatDistanceToNow } from 'date-fns'
import ptBR from 'date-fns/locale/pt-BR'
import { useCycles } from '../../contexts/CyclesContext'
import {
  EmptyHistory,
  HistoryContainer,
  HistoryHeader,
  HistoryList,
  Status,
} from './styles'

export function History() {
  const { cycles, clearHistory, activeCycleId } = useCycles()
  const orderedCycles = [...cycles].reverse()
  const hasPastCycles = cycles.some((cycle) => cycle.id !== activeCycleId)

  return (
    <HistoryContainer>
      <HistoryHeader>
        <h1>Meu histórico</h1>
        {hasPastCycles && (
          <button type="button" onClick={clearHistory}>
            Limpar histórico
          </button>
        )}
      </HistoryHeader>

      {orderedCycles.length === 0 ? (
        <EmptyHistory>
          <p>Nenhum ciclo registrado ainda.</p>
          <span>
            Comece um pomodoro na página do timer para ver o histórico aqui.
          </span>
        </EmptyHistory>
      ) : (
        <HistoryList>
          <table>
            <thead>
              <tr>
                <th>Tarefa</th>
                <th>Duração</th>
                <th>Início</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orderedCycles.map((cycle) => {
                return (
                  <tr key={cycle.id}>
                    <td>{cycle.task}</td>
                    <td>{cycle.minutesAmount} minutos</td>
                    <td>
                      {formatDistanceToNow(new Date(cycle.startDate), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </td>
                    <td>
                      {cycle.finishedDate && (
                        <Status $statusColor="green">Concluído</Status>
                      )}

                      {cycle.interruptedDate && (
                        <Status $statusColor="red">Interrompido</Status>
                      )}

                      {!cycle.finishedDate && !cycle.interruptedDate && (
                        <Status $statusColor="yellow">Em andamento</Status>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </HistoryList>
      )}
    </HistoryContainer>
  )
}
