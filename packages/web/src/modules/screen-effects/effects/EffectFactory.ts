import type { ScreenEffect, EffectType } from './types'
import { SakuraEffect } from './SakuraEffect'
import { FireworksEffect } from './FireworksEffect'
import { GlowParticlesEffect } from './GlowParticlesEffect'
import { FloatingDustEffect } from './FloatingDustEffect'
import { AuroraEffect } from './AuroraEffect'
import { MeteorEffect } from './MeteorEffect'
import { WaterRippleEffect } from './WaterRippleEffect'
import { StarfieldEffect } from './StarfieldEffect'

export function createEffect(type: EffectType): ScreenEffect {
  switch (type) {
    case 'sakura': return new SakuraEffect()
    case 'fireworks': return new FireworksEffect()
    case 'glowParticles': return new GlowParticlesEffect()
    case 'floatingDust': return new FloatingDustEffect()
    case 'aurora': return new AuroraEffect()
    case 'meteor': return new MeteorEffect()
    case 'waterRipple': return new WaterRippleEffect()
    case 'starfield': return new StarfieldEffect()
    default: throw new Error(`Unknown effect type: ${type}`)
  }
}
