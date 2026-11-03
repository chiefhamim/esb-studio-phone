// Origin: esb-banner-studio src/core/types.ts (Align, TextRun, Stroke-free subset of TextEl), reduced to what text.ts needs.
export type Align = 'left' | 'center' | 'right'
export type FontId = 'inter' | 'grotesk' | 'serif' | 'oswald' | 'bengali'
export interface TextRun { start: number; end: number; color: string; style?: 'marker' | 'underline'; bg?: string }
export interface TextEl {
  kind: 'text'
  text: string
  x: number
  y: number
  w: number
  h: number
  weight: 500 | 700 | 800
  font?: FontId
  size: number
  /** letter spacing in px */
  ls: number
  /** line height in percent of font size; null = font default */
  lh: number | null
  align: Align
  color: string
  runs: TextRun[]
  /** 'hug' = box width follows the text (single line); 'box' = wraps inside w */
  fit: 'hug' | 'box'
  italic?: boolean
  stroke?: { color: string; width: number }
}
