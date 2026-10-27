/** Bi Artı Danışmanlık logosu (Erdal, 27.10.2026). Koyu zeminde beyaz kutu içinde gösterilir; lacivert kare zemine karışmasın. */
export function Logo({ height = 40, onDark = false }: { height?: number; onDark?: boolean }) {
  return <img src="/logo.png" alt="Bi Artı Danışmanlık" className={onDark ? 'logo logo-on-dark' : 'logo'} style={{ height }} />;
}
