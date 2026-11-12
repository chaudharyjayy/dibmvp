/**
 * Footer. One sentence, and nothing stronger than what we can defend:
 * validation results go up when they exist.
 */

import { LOAD, riseStyle } from "./load";
import { type } from "./type";

export default function SiteFooter() {
  return (
    <footer className="w-full border-t border-line bg-page/80">
      <div className="mx-auto w-full max-w-[1440px] px-5 py-10 md:px-12">
        <p
          className={`landing-load text-ink-2 ${type.small}`}
          style={riseStyle(0, LOAD.body.duration, LOAD.body.y)}
        >
          We publish validation results when they exist.
        </p>
      </div>
    </footer>
  );
}
