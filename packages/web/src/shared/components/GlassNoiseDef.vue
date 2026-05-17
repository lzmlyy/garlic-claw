<template>
  <svg style="display:none" aria-hidden="true">
    <defs>
      <filter id="gc-glass-noise">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="1.35"
          numOctaves="3"
          stitchTiles="stitch"
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
    </defs>
  </svg>
</template>
