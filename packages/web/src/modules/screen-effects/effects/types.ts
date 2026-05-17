export type EffectType =
  | 'fireworks'
  | 'sakura'
  | 'glowParticles'
  | 'floatingDust'
  | 'aurora'
  | 'meteor'
  | 'waterRipple'
  | 'starfield'

export interface EffectConfig {
  intensity: number // 0-100
  count: number // 0-100 (mapped to actual particle counts)
  speed: number // 0-100
}

export interface EffectState {
  enabled: boolean
  config: EffectConfig
}

export type EffectStateMap = Record<EffectType, EffectState>

export interface ScreenEffectsSettings {
  masterEnabled: boolean
  effects: EffectStateMap
}

export interface ScreenEffect {
  readonly type: EffectType
  update(dt: number, config: EffectConfig, width: number, height: number): void
  render(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void
  resize(width: number, height: number): void
  dispose(): void
}

export const EFFECT_LABELS: Record<EffectType, string> = {
  fireworks: 'Fireworks',
  sakura: 'Sakura Falling',
  glowParticles: 'Glow Particles',
  floatingDust: 'Floating Dust',
  aurora: 'Aurora Lights',
  meteor: 'Meteor Shower',
  waterRipple: 'Water Ripple',
  starfield: 'Starfield',
}

export const EFFECT_DEFAULTS: EffectStateMap = {
  fireworks: { enabled: false, config: { intensity: 50, count: 50, speed: 50 } },
  sakura: { enabled: false, config: { intensity: 60, count: 50, speed: 40 } },
  glowParticles: { enabled: false, config: { intensity: 50, count: 40, speed: 30 } },
  floatingDust: { enabled: false, config: { intensity: 40, count: 30, speed: 20 } },
  aurora: { enabled: false, config: { intensity: 50, count: 50, speed: 30 } },
  meteor: { enabled: false, config: { intensity: 50, count: 30, speed: 60 } },
  waterRipple: { enabled: false, config: { intensity: 50, count: 50, speed: 40 } },
  starfield: { enabled: false, config: { intensity: 50, count: 50, speed: 30 } },
}

export function isMobile(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function getMobileScale(): number {
  if (!isMobile()) return 1
  // Scale down particle counts for mobile
  return 0.4
}
