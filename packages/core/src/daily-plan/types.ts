export interface DailyPlan {
  date: string
  essentialTaskId: string | null
  secondaryTaskIds: string[]
  createdAt: string
  updatedAt: string
}
