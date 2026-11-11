/**
 * Type scale for the landing page (spec §3). Values are the 1440 set with the
 * 390 set as the base, so mobile needs no override. Kept as class strings so
 * every heading, body and caption shares one definition.
 */
export const type = {
  /** Display 64/68 @1440 → 38/42 @390 */
  display:
    "text-[38px] leading-[42px] font-semibold tracking-[-0.02em] md:text-[64px] md:leading-[68px]",
  /** H2 40/46 @1440 → 28/34 @390 */
  h2: "text-[28px] leading-[34px] font-semibold tracking-[-0.015em] md:text-[40px] md:leading-[46px]",
  /** H3 22/30 @1440 → 20/28 @390 */
  h3: "text-[20px] leading-[28px] font-semibold md:text-[22px] md:leading-[30px]",
  /** Body 18/28 @1440 → 16/24 @390 */
  body: "text-[16px] leading-[24px] md:text-[18px] md:leading-[28px]",
  /** Small 14/20 */
  small: "text-[14px] leading-[20px]",
  /** Caption: mono, uppercase, +0.08em, 12/16 */
  caption: "font-mono text-[12px] leading-[16px] uppercase tracking-[0.08em]",
} as const;
