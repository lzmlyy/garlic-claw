import type { WallpaperPreset } from './types'

export const wallpaperPresets: WallpaperPreset[] = [
  {
    id: 'none',
    label: '无',
    sourceKind: 'preset',
    sourceUrl: '',
  },
  // ── Atmosphere presets ──
  {
    id: 'mist-morning',
    label: '晨雾',
    sourceKind: 'gradient',
    sourceUrl:
      'linear-gradient(155deg, #1e293b 0%, #2d3a4f 20%, #314458 40%, #263545 65%, #1a2332 100%)',
  },
  {
    id: 'neon-twilight',
    label: '霓虹',
    sourceKind: 'gradient',
    sourceUrl:
      'linear-gradient(140deg, #1a1028 0%, #241545 25%, #1e2448 45%, #1a1030 70%, #0f0c1e 100%)',
  },
  {
    id: 'cold-light',
    label: '冷光',
    sourceKind: 'gradient',
    sourceUrl:
      'linear-gradient(150deg, #0f1e2e 0%, #152d42 25%, #1a3856 50%, #12283a 75%, #0c1a28 100%)',
  },
  {
    id: 'deep-sea',
    label: '深海',
    sourceKind: 'gradient',
    sourceUrl:
      'linear-gradient(160deg, #061218 0%, #0a1f2b 20%, #0c2a3a 45%, #081d28 70%, #051016 100%)',
  },
  {
    id: 'dusk-amber',
    label: '黄昏',
    sourceKind: 'gradient',
    sourceUrl:
      'linear-gradient(145deg, #1f1818 0%, #2d2020 20%, #2a1e28 45%, #1f181e 70%, #151118 100%)',
  },
  {
    id: 'darkroom',
    label: '暗房',
    sourceKind: 'gradient',
    sourceUrl:
      'linear-gradient(140deg, #0f0f11 0%, #16141a 30%, #121118 60%, #0d0c10 100%)',
  },
  {
    id: 'aurora-deep',
    label: '极光',
    sourceKind: 'gradient',
    sourceUrl:
      'linear-gradient(135deg, #0c1520 0%, #142040 30%, #0f2840 55%, #0c1525 100%)',
  },
  {
    id: 'forest-mist',
    label: '林雾',
    sourceKind: 'gradient',
    sourceUrl:
      'linear-gradient(150deg, #141f16 0%, #1a2a1d 25%, #1d3020 55%, #152218 100%)',
  },
  {
    id: 'violet-hour',
    label: '紫时',
    sourceKind: 'gradient',
    sourceUrl:
      'linear-gradient(140deg, #181525 0%, #221d36 30%, #1f1e32 60%, #151222 100%)',
  },
  {
    id: 'glacier-light',
    label: '冰渊',
    sourceKind: 'gradient',
    sourceUrl:
      'linear-gradient(145deg, #0e1c26 0%, #142a38 30%, #183648 60%, #0f1e2a 100%)',
  },
  {
    id: 'ember-warm',
    label: '余烬',
    sourceKind: 'gradient',
    sourceUrl:
      'linear-gradient(145deg, #1c1714 0%, #28201a 25%, #221d18 55%, #191412 100%)',
  },
  {
    id: 'slate-mist',
    label: '石墨',
    sourceKind: 'gradient',
    sourceUrl:
      'linear-gradient(135deg, #1a2129 0%, #25303b 30%, #1d262f 65%, #141a21 100%)',
  },
]
