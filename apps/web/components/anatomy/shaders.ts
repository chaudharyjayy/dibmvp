/**
 * The shaders the anatomy model is drawn with.
 *
 * Three looks: the glass skin, the organs that tint with the drug level, and
 * the brain. Shared by the landing figure and the simulator so the model
 * cannot look like two different models on two routes.
 */

/** The skin: a thin glass shell whose edges catch the light. */
export const BODY_VERTEX = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  varying float vWorldY;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - world.xyz);
    vWorldY = world.y;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const BODY_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uScan;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  varying float vWorldY;
  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 v = normalize(vViewDir);
    // The skin is a thin sheet, so what reads is its edge: the light gathers
    // where the surface turns away from the eye. The Fresnel term alone is
    // not enough — on a sheet this thin, the whole surface catches it and
    // the body turns into a solid white shell.
    float facing = abs(dot(n, v));
    // A dead zone in the middle of the term, so the flat of the sheet stays
    // clear and the organs read through it.
    float edge = smoothstep(0.45, 0.96, 1.0 - facing);
    // The scan band is what makes it read as a hologram rather than a ghost:
    // one horizontal band of light travelling down the body.
    float band = exp(-pow((vWorldY - uScan) * 6.5, 2.0));
    float alpha = edge * 0.85 + band * 0.12;
    gl_FragColor = vec4(uColor * (0.85 + band * 1.5), alpha);
  }
`;

/* One lit-with-tint shader for every organ, but with the level as a uniform:
   the GLB organs are plain meshes, not an InstancedMesh. */
export const ORGAN_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const ORGAN_FRAGMENT = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTint;
  uniform float uLevel;
  uniform float uFocus;
  uniform float uTintMix;
  uniform vec3 uLightDir;
  uniform float uLightIntensity;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vec3 n = normalize(vNormalW);
    float level = clamp(uLevel, 0.0, 1.0);
    float focus = clamp(uFocus, 0.0, 1.0);
    // How far the drug repaints the tissue towards the accent. The landing
    // figure fills the organ with the accent; in the simulator the camera
    // is close enough that the tissue has to stay legible, so the level
    // shows as brightness and a rim instead.
    vec3 body = mix(uBase, uTint, uTintMix * pow(level, 0.8));
    float lambert = clamp(dot(n, normalize(uLightDir)), 0.0, 1.0);
    // Lifted and self-lit: the model's own tissue colours are dark reds and
    // would disappear against a dark panel, so the tissue carries its own
    // glow and the level adds the accent on top.
    vec3 lit = body * (0.55 + 0.45 * lambert * uLightIntensity) * 1.35;
    float rim = pow(1.0 - abs(dot(n, normalize(vViewDir))), 2.6);
    vec3 colour = lit * (1.0 + 0.35 * level) + uTint * (0.08 + 0.34 * level * rim);
    // uFocus is the camera's attention: the organ the walkthrough is about
    // is brighter than the ones it is passing. It brightens the tissue in
    // its own colour rather than adding the accent on top — a dark organ
    // lit only by the accent would turn blue and stop reading as tissue.
    colour = colour * (1.0 + focus * 0.5) + uTint * focus * 0.08;
    gl_FragColor = vec4(colour, 1.0);
  }
`;

/* Brain: the tissue look, plus a Fresnel rim so the folds read as a solid form
   inside the glass head. The GLB carries no per-vertex tone, so the tone
   term is gone; the rim does the same job. */
export const BRAIN_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const BRAIN_FRAGMENT = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTint;
  uniform float uFocus;
  uniform vec3 uLightDir;
  uniform float uLightIntensity;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vec3 n = normalize(vNormalW);
    float lambert = clamp(dot(n, normalize(uLightDir)), 0.0, 1.0);
    float fill = clamp(dot(n, -normalize(uLightDir)), 0.0, 1.0);
    float focus = clamp(uFocus, 0.0, 1.0);
    vec3 lit = uBase * (0.62 + 0.34 * lambert * uLightIntensity + 0.12 * fill) * 1.35;
    float rim = pow(1.0 - abs(dot(n, normalize(vViewDir))), 2.4);
    lit += uTint * rim * (0.38 + focus * 0.7);
    gl_FragColor = vec4(lit, 1.0);
  }
`;
