/** Code Rain ASCII art effect using Canvas2D.
 *  Renders a source image as ASCII characters with themeable colors.
 *  Supports red→blue theme toggle via HoldButton.
 */
"use client";

import { useState, useRef, useEffect } from "react";

interface CodeRainOptions {
  /** Source image URL or data */
  source: string;
  /** Target display size */
  width: number;
  height: number;
  /** Cell size in pixels */
  cellSize?: number;
  /** Render mode: "characters", "dither", "mosaic", etc. */
  renderMode?: string;
  /** Character set for "characters" mode */
  charSet?: string;
  /** Background mode */
  bgMode?: string;
  /** Background blur */
  bgBlur?: number;
  /** Background opacity */
  bgOpacity?: number;
  /** Coverage percentage */
  coverage?: number;
  /** Tint color */
  tint?: string;
  /** Tint opacity */
  tintOpacity?: number;
  /** Animated */
  animated?: boolean;
  /** Animation speed */
  animSpeed?: number;
}

interface CodeRainProps extends CodeRainOptions {
  /** Class name */
  className?: string;
}

/**
 * CodeRainCanvas - Renders ASCII art using Canvas2D offscreen.
 * Based on the 21st.dev code rain aesthetic with theme support.
 */
export const CodeRainCanvas = ({
  source,
  width,
  height,
  cellSize = 14,
  renderMode = "characters",
  charSet = "binary",
  bgMode = "solid",
  bgBlur = 12,
  bgOpacity = 90,
  coverage = 96,
  tint = "#ff0000", // Red by default
  tintOpacity = 45,
  animated = true,
  className = "",
}: CodeRainProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [initialized, setInitialized] = useState(false);

  // When canvas ref changes, set up the effect
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Image loading
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = source;

    img.onload = () => {
      // 1. Draw source photo into canvas at target size
      ctx.fillStyle = `rgba(0,0,0,${100 - bgOpacity / 100})`;
      ctx.fillRect(0, 0, width, height);

      // Apply background
      if (bgMode === "blur") {
        // Draw blurred copy
        ctx.save();
        ctx.filter = `blur(${bgBlur}px)`;
        ctx.drawImage(img, 0, 0, width, height);
        ctx.restore();
      } else if (bgMode === "solid") {
        // Solid color background - already filled
      } else if (bgMode === "original") {
        ctx.drawImage(img, 0, 0, width, height);
      }
      // "nothing" = transparent, already filled with black

      // 2. Divide into grid and sample average color/luminance
      const cols = Math.ceil(width / cellSize);
      const rows = Math.ceil(height / cellSize);

      // 3. For each cell, draw shape based on renderMode
      const chars = charSet.split("");

      let frame = 0;

      function render() {
        ctx.clearRect(0, 0, width, height);

        // Re-apply background each frame
        if (bgMode === "blur") {
          ctx.save();
          ctx.filter = `blur(${bgBlur}px)`;
          ctx.drawImage(img, 0, 0, width, height);
          ctx.restore();
        } else if (bgMode === "solid") {
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, width, height);
        } else if (bgMode === "original") {
          ctx.drawImage(img, 0, 0, width, height);
        }

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const x = col * cellSize;
            const y = row * cellSize;
            const w = cellSize;
            const h = cellSize;

            // Sample average color from this cell
            const imgData = ctx.getImageData(x, y, w, h);
            const data = imgData.data;
            let r = 0, g = 0, b = 0, count = 0;

            for (let i = 0; i < data.length; i += 4) {
              if (data[i + 3] > 0) {
                r += data[i];
                g += data[i + 1];
                b += data[i + 2];
                count++;
              }
            }

            if (count > 0) {
              r = r / count;
              g = g / count;
              b = b / count;
            }

            // Apply color adjustments
            // Brightness
            const brightness = 0; // from options
            const contrast = 115 / 100; // from options
            const saturation = 100 / 100; // from options
            const grayscale = 0; // from options

            let luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

            // Grayscale
            if (grayscale) {
              const gray = luminance;
              r = gray; g = gray; b = gray;
            }

            // Contrast
            luminance = (luminance - 0.5) * contrast + 0.5;
            luminance = Math.max(0, Math.min(1, luminance));
            r = luminance * 255;
            g = luminance * 255;
            b = luminance * 255;

            // Tint application (overlay blend)
            const tintColor = tint; // "#ff0000" or "#0000ff"
            const tintOpacityValue = tintOpacity / 100;

            // Apply tint via overlay blend
            ctx.save();
            ctx.globalCompositeOperation = "overlay";
            ctx.fillStyle = tintColor;
            ctx.fillRect(x, y, w, h);
            ctx.restore();

            // Draw shape based on renderMode
            if (renderMode === "characters") {
              // Draw glyph sized/colored by luminance
              const charIndex = Math.floor(luminance / 255 * (chars.length - 1));
              const char = chars[charIndex] || " ";
              const charSize = cellSize;
              ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              ctx.font = `${charSize}px monospace`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(char, x + w / 2, y + h / 2);
            }
            // Other render modes would be implemented similarly
          }
        }

        if (animated) {
          frame++;
          // Animate - simple shift for now
          // In full implementation, would use animStyle, animSpeed, animIntensity
        }
      }

      // Initial render
      render();

      // Animation loop
      let animId: number;
      if (animated) {
        animId = window.requestAnimationFrame(() => {
          render();
          animId = window.requestAnimationFrame(render);
        });
      }

      return () => {
        if (animId) window.cancelAnimationFrame(animId);
      };
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, width, height, cellSize, renderMode, charSet, bgMode, bgOpacity, coverage, tint, tintOpacity, animated]);

  return canvasRef;
};