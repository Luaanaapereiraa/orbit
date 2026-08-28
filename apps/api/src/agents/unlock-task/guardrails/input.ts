import type { SupportedLocale } from '@destravai/contracts'

const CRISIS_PATTERN =
  /\b(suicid|se matar|me matar|autoagress|auto-agress|me cortar|self-harm|kill myself|end my life|quero morrer|tirar minha vida)\b/i

export interface ContentModerator {
  inspect(text: string): Promise<{ blocked: boolean }>
}

export class PatternModerator implements ContentModerator {
  async inspect(text: string) {
    return { blocked: CRISIS_PATTERN.test(text) }
  }
}

export class FailingModerator implements ContentModerator {
  async inspect(): Promise<{ blocked: boolean }> {
    throw new Error('moderation_unavailable')
  }
}

export function collectModerationText(input: {
  title: string
  nextAction: string | null
  blockageDetails: string | null
}): string {
  return [input.title, input.nextAction ?? '', input.blockageDetails ?? ''].join('\n')
}

export function safetyRejectionMessage(locale: SupportedLocale) {
  if (locale === 'en-US') {
    return 'This does not look like a productivity request. If you are in danger, contact local emergency services or a trusted person nearby.'
  }

  return 'Isso nao parece um pedido de produtividade. Se voce estiver em risco, procure ajuda local de emergencia ou alguem de confianca por perto.'
}
