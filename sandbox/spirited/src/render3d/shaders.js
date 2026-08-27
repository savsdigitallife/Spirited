// GLSL for the whole game: one lighting model shared by the world mesh and by
// every box and sphere drawn on top of it.

const COMMON = `
precision highp float;
precision highp sampler2DShadow;

const float FLAG_WATER = 1.0;
const float FLAG_EMISSIVE = 2.0;
const float FLAG_SHORT = 8.0;

bool hasFlag(float flags, float bit) {
  return mod(floor(flags / bit), 2.0) >= 0.5;
}

// Wind. 'sway' is how free a vertex is to move (0 at a plant's root, 1 at its
// tip); 'phase' scatters neighbouring plants so a field ripples rather than
// pulsing in unison. Gusts roll across the map as a slow travelling wave.
vec3 windOffset(vec3 world, float sway, float phase, vec2 dir, float strength, float time) {
  if (sway <= 0.0 || strength <= 0.0) return vec3(0.0);
  float travel = time * 0.6 - (world.x * dir.x + world.z * dir.y) * 0.09;
  float gust = 0.55 + 0.45 * sin(travel) * sin(travel * 0.37 + 1.7);
  float t = time * 2.3 + phase;
  float wave = sin(t) * 0.6 + sin(t * 2.7 + phase) * 0.25;
  float push = (wave * 0.5 + 0.65) * strength * gust * sway;
  return vec3(dir.x * push, -abs(wave) * sway * strength * 0.16, dir.y * push);
}
`;

export const WORLD_VS = `#version 300 es
${COMMON}
in vec3 aPos;
in vec3 aNrm;
in vec2 aUv;
in float aLayer;
in float aAo;
in float aFlags;
in float aSway;
in float aPhase;

uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uWindTime;
uniform mat4 uViewProj;
uniform mat4 uLightViewProj;
uniform mat4 uModel;
uniform float uTime;

out vec3 vWorld;
out vec3 vNrm;
out vec2 vUv;
out float vLayer;
out float vAo;
out float vFlags;
out vec4 vLightPos;

void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  // Water breathes rather than sits still: two crossing swells, with the wind
  // stretching them along its own direction.
  if (hasFlag(aFlags, FLAG_WATER)) {
    float w = dot(world.xz, uWindDir);
    world.y += sin(w * 1.9 + uTime * 1.9) * 0.045
             + sin(world.z * 2.3 - uTime * 1.1) * 0.03
             + sin(world.x * 3.7 + uTime * 2.6) * 0.018;
  }
  world.xyz += windOffset(world.xyz, aSway, aPhase, uWindDir, uWindStrength, uWindTime);
  vWorld = world.xyz;
  vNrm = mat3(uModel) * aNrm;
  vUv = aUv;
  vLayer = aLayer;
  vAo = aAo;
  vFlags = aFlags;
  // Push the shadow lookup along the normal: cheap, and it removes
  // almost all of the surface acne before the depth bias has to.
  vLightPos = uLightViewProj * vec4(world.xyz + normalize(mat3(uModel) * aNrm) * 0.07, 1.0);
  gl_Position = uViewProj * world;
}
`;

export const WORLD_FS = `#version 300 es
${COMMON}
in vec3 vWorld;
in vec3 vNrm;
in vec2 vUv;
in float vLayer;
in float vAo;
in float vFlags;
in vec4 vLightPos;

uniform highp sampler2DArray uAtlas;
uniform sampler2DShadow uShadow;
uniform vec3 uCamera;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uTime;
uniform vec3 uLampPos;
uniform vec3 uLampColor;
uniform float uLampRange;
uniform vec3 uTint;
uniform float uUseTexture;
uniform float uLayerOverride;
uniform float uEmissive;
uniform vec3 uCutFrom;        // player position, for the wall cutaway
uniform float uCutEnabled;
uniform float uAlpha;
uniform float uWetness;       // 0 dry, 1 streaming with rain
uniform vec3 uNeon;           // colour the wet ground throws back

out vec4 fragColor;

float shadowFactor(vec3 n, vec3 l, float biasScale) {
  vec3 proj = vLightPos.xyz / vLightPos.w;
  proj = proj * 0.5 + 0.5;
  if (proj.z > 1.0 || proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0) return 1.0;
  float bias = max(0.005 * (1.0 - dot(n, l)), 0.0018) * biasScale;
  float sum = 0.0;
  vec2 texel = vec2(1.0 / 2048.0);
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      sum += texture(uShadow, vec3(proj.xy + vec2(float(x), float(y)) * texel, proj.z - bias));
    }
  }
  return sum / 9.0;
}

// 8x8 ordered dither: fine enough that a dissolving wall reads as a screen
// door rather than as noise.
float dither(vec2 p) {
  vec2 q = mod(p, 8.0);
  float x = floor(q.x);
  float y = floor(q.y);
  // Bayer 8x8, built from the 2x2 recurrence rather than stored as a table.
  float v = 0.0;
  float f = 1.0;
  for (int i = 0; i < 3; i++) {
    float bx = mod(x, 2.0);
    float by = mod(y, 2.0);
    v += f * mod(3.0 * bx + 2.0 * by, 4.0) / 4.0;
    f *= 0.25;
    x = floor(x / 2.0);
    y = floor(y / 2.0);
  }
  return v * 0.75;
}

void main() {
  bool water = hasFlag(vFlags, FLAG_WATER);

  // Anything standing on the line between the camera and Aiko dissolves.
  // The cleared volume is a cone — narrow at the lens, wide at Aiko — so it
  // stays roughly the same size on screen instead of eating half the frame.
  if (uCutEnabled > 0.5 && !hasFlag(vFlags, FLAG_SHORT) && vWorld.y > 0.75) {
    vec3 toPlayer = uCutFrom - uCamera;
    float span = length(toPlayer);
    vec3 dir = toPlayer / max(span, 0.001);
    float along = dot(vWorld - uCamera, dir);
    if (along > 0.3 && along < span - 0.8) {
      float radial = length((vWorld - uCamera) - dir * along);
      float radius = mix(0.22, 1.55, along / span);
      float fade = 1.0 - smoothstep(radius * 0.72, radius, radial);
      if (fade > dither(gl_FragCoord.xy)) discard;
    }
  }

  // Glow shells: pure light, no shading and no fog, faded toward the rim so
  // a lantern's halo reads as light rather than as a painted disc.
  if (uEmissive > 1.9) {
    float rim = abs(dot(normalize(vNrm), normalize(uCamera - vWorld)));
    fragColor = vec4(uTint, uAlpha * rim * rim);
    return;
  }

  vec4 texel = vec4(1.0);
  if (uUseTexture > 0.5) {
    vec2 uv = vUv;
    if (water) uv += vec2(sin(uTime * 0.4 + vWorld.z * 0.3), cos(uTime * 0.33 + vWorld.x * 0.3)) * 0.05;
    float layer = uLayerOverride >= 0.0 ? uLayerOverride : vLayer;
    texel = texture(uAtlas, vec3(uv, layer));
  }
  vec3 albedo = texel.rgb * uTint;

  // Break the tiling: a slow swell of light and shade across the ground, plus
  // a fine grain from the same texture read at a much smaller scale.
  if (uUseTexture > 0.5) {
    float macro = 0.86 + 0.28 * (sin(vWorld.x * 0.21 + 1.3) * sin(vWorld.z * 0.17) * 0.5 + 0.5);
    float grain = texture(uAtlas, vec3(vUv * 5.7, vLayer)).g;
    albedo *= mix(1.0, macro, 0.7) * mix(1.0, 0.78 + grain * 0.5, 0.35);
  }

  vec3 n = normalize(vNrm);

  // Wet ground: darker, sharper, and busy with rings where the rain lands.
  float wet = 0.0;
  if (uWetness > 0.01 && !water) {
    wet = uWetness * clamp(n.y, 0.0, 1.0);
    if (wet > 0.01) {
      // Puddles gather in some places and not others.
      float pool = sin(vWorld.x * 0.7) * sin(vWorld.z * 0.6 + 1.3)
                 + 0.5 * sin(vWorld.x * 1.9 + 2.1) * sin(vWorld.z * 1.7);
      wet *= clamp(0.45 + pool * 0.55, 0.15, 1.0);
      // Ripple rings: fast, small, and only where it is actually wet.
      float ring = sin((vWorld.x * 9.0 + vWorld.z * 7.0) - uTime * 9.0)
                 + sin((vWorld.x * 6.3 - vWorld.z * 8.1) + uTime * 11.0);
      n = normalize(n + vec3(ring * 0.05 * wet, 0.0, ring * 0.045 * wet));
    }
  }

  if (water) {
    // Two crossing wave sets, faked as a normal perturbation.
    float w1 = sin(vWorld.x * 3.1 + uTime * 1.9);
    float w2 = cos(vWorld.z * 2.7 - uTime * 1.4);
    n = normalize(n + vec3(w1 * 0.22, 0.0, w2 * 0.22));
  }
  vec3 l = normalize(uSunDir);
  vec3 v = normalize(uCamera - vWorld);

  float ndl = max(dot(n, l), 0.0);
  float shade = shadowFactor(n, l, 1.0);
  vec3 direct = uSunColor * ndl * shade;

  // Hemisphere ambient: sky above, bounced ground below.
  float hemi = n.y * 0.5 + 0.5;
  vec3 ambient = mix(uGroundColor, uSkyColor, hemi) * vAo;

  vec3 color = albedo * mix(vec3(1.0), vec3(0.62), wet) * (direct + ambient);

  // Specular: strong on water, a sheen on everything else, and a hard
  // highlight anywhere the rain has left a film.
  vec3 h = normalize(l + v);
  float gloss = mix(28.0, 120.0, wet);
  float spec = pow(max(dot(n, h), 0.0), water ? 90.0 : gloss) * (water ? 0.85 : 0.06 + wet * 0.7);
  color += uSunColor * spec * shade;

  if (wet > 0.01) {
    // A wet street mirrors the signs above it.
    float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
    color += uNeon * fres * wet * 1.6;
    color += uNeon * wet * 0.1;
  }

  if (water) {
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    color = mix(color, uSkyColor * 1.5, fres * 0.5);
  }

  // Lamp Aiko carries with her, so dark places stay readable.
  float lampDist = length(vWorld - uLampPos);
  float lampFall = clamp(1.0 - lampDist / uLampRange, 0.0, 1.0);
  vec3 lampDir = normalize(uLampPos - vWorld + vec3(0.0, 0.6, 0.0));
  color += albedo * uLampColor * lampFall * lampFall * (0.35 + 0.65 * max(dot(n, lampDir), 0.0));

  float emissive = uEmissive + (hasFlag(vFlags, FLAG_EMISSIVE) ? 0.45 : 0.0);
  color += albedo * emissive;

  float dist = length(uCamera - vWorld);
  float fog = 1.0 - exp(-uFogDensity * dist * dist * 0.02);
  color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));

  fragColor = vec4(color, uAlpha);
}
`;

export const DEPTH_VS = `#version 300 es
${COMMON}
in vec3 aPos;
in float aSway;
in float aPhase;
uniform mat4 uLightViewProj;
uniform mat4 uModel;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uWindTime;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  // Shadows have to bend with the same wind, or they tear off the plants.
  world.xyz += windOffset(world.xyz, aSway, aPhase, uWindDir, uWindStrength, uWindTime);
  gl_Position = uLightViewProj * world;
}
`;

export const DEPTH_FS = `#version 300 es
precision mediump float;
void main() {}
`;

export const SKY_VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos;
  gl_Position = vec4(aPos, 0.999, 1.0);
}
`;

export const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSunColor;
uniform vec2 uSunScreen;
uniform float uStars;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
}

void main() {
  float t = clamp(vUv.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 color = mix(uHorizon, uZenith, pow(t, 0.75));

  if (uStars > 0.01) {
    vec2 cell = floor(vUv * 220.0);
    float star = step(0.9975, hash(cell));
    color += vec3(star * uStars * t);
  }

  // A soft glow where the sun sits, without drawing a disc.
  float d = distance(vUv, uSunScreen);
  color += uSunColor * exp(-d * 4.5) * 0.55;

  fragColor = vec4(color, 1.0);
}
`;
