/** Links to the imprint and privacy notice (static pages, readable without signing in). */
export function legalLinks(): string {
  return `
    <nav class="legal-links" aria-label="Rechtliches">
      <a href="./impressum.html">Impressum</a>
      <a href="./datenschutz.html">Datenschutz</a>
    </nav>`;
}
