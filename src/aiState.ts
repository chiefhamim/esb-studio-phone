// AI master state: pause toggle and active provider preference stored in localStorage.
export const AI_PAUSED_KEY = 'esb-ai-paused'
export const AI_MODEL_KEY = 'esb-ai-model'

export function isAiPaused(): boolean {
  try {
    return localStorage.getItem(AI_PAUSED_KEY) === 'true'
  } catch {
    return false
  }
}

export function setAiPaused(paused: boolean): void {
  try {
    if (paused) localStorage.setItem(AI_PAUSED_KEY, 'true')
    else localStorage.removeItem(AI_PAUSED_KEY)
  } catch {
    /* session only in private mode */
  }
  window.dispatchEvent(new Event('esb-ai-state-change'))
}

export function getAiModel(): string {
  try {
    return localStorage.getItem(AI_MODEL_KEY) || 'gemini-2.5-flash'
  } catch {
    return 'gemini-2.5-flash'
  }
}

export function setAiModel(model: string): void {
  try {
    localStorage.setItem(AI_MODEL_KEY, model)
  } catch {
    /* session only */
  }
  window.dispatchEvent(new Event('esb-ai-state-change'))
}
