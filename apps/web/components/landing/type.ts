/**
 * Type scale for the landing page (spec §3). Values are the 1440 set with
 * the 390 set as the base, so mobile needs no override. Kept as class strings
 * so every heading, body and caption shares one definition.
 *
 * The display sizes are set by what the face measures, not by the spec: the
 * headline is broken into three lines by hand, and the display face is wider
 * than the one it replaced, so the spec's 64/38 would have wrapped the second
 * line onto two. These sizes keep each line on one line at every width.
 */
export const type = {
  /** Display 54/60 @1440 → 32/36 @390 */
  display:
    "font-heading text-[32px] leading-[36px] font-semibold tracking-[-0.01em] text-balance md:text-[clamp(28px,3.7vw,54px)] md:leading-[clamp(34px,4.1vw,60px)]",
  /** H2 36/42 @1440 → 27/32 @390 */
  h2: "font-heading text-[27px] leading-[32px] font-semibold tracking-[-0.005em] text-balance md:text-[36px] md:leading-[42px]",
  /** H3 22/30 @1440 → 19/26 @390 */
  h3: "font-heading text-[19px] leading-[26px] font-semibold md:text-[22px] md:leading-[30px]",
  /** Body 18/28 @1440 → 16/24 @390 */
  body: "text-[16px] leading-[24px] text-pretty md:text-[18px] md:leading-[28px]",
  /** Small 14/20 */
  small: "text-[14px] leading-[20px] text-pretty",
  /** Caption: mono, uppercase, +0.08em, 12/16 */
  caption: "font-mono text-[12px] leading-[16px] uppercase tracking-[0.08em]",
} as const;
