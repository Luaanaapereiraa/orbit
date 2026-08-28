export type TaskStatus = 'inbox' | 'active' | 'done' | 'archived'
export type TaskEnergy = 'low' | 'medium' | 'high'

export interface Task {
  id: string
  title: string
  nextAction: string | null
  status: TaskStatus
  estimatedMinutes: number | null
  energy: TaskEnergy | null
  position: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface LegacyTask {
  id: string
  name: string
  createdAt: Date | string
}

export interface BuildTaskInput {
  id: string
  title: string
  now: string
  status?: TaskStatus
  nextAction?: string | null
  estimatedMinutes?: number | null
  energy?: TaskEnergy | null
  position?: number
}
