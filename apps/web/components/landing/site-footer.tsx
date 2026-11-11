/**
 * Footer. One sentence, and nothing stronger than what we can defend:
 * validation results go up when they exist.
 */

import { type } from "./type";

export default function SiteFooter() {
  return (
    <footer className="w-full border-t border-line bg-page">
      <div className="mx-auto w-full max-w-[1440px] px-5 py-10 md:px-12">
        <p className={`text-ink-2 ${type.small}`}>
          We publish validation results when they exist.
        </p>
      </div>
    </footer>
  );
}
