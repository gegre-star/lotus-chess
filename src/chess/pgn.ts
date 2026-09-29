/**
 * Export d'une partie en PGN, le format que lisent chess.com, lichess et tous
 * les logiciels d'échecs.
 *
 * L'application affiche la notation **française** (R D T F C) ; le PGN, lui,
 * est anglais (K Q R B N). On convertit sans réécrire `toSAN` : les lettres
 * de pièces sont les seules majuscules qui diffèrent, et elles ne
 * s'écrivent qu'en début de coup ou après « = » pour une promotion.
 */
const FR_VERS_EN: Record<string, string> = { R: 'K', D: 'Q', T: 'R', F: 'B', C: 'N' };

/** « Cf3+ » → « Nf3+ », « e8=D » → « e8=Q ». Le roque n'est pas touché. */
export function versAnglais(san: string): string {
  if (san.startsWith('O-O')) return san;
  return san
    .replace(/^[RDTFC]/, (l) => FR_VERS_EN[l])
    .replace(/=([DTFC])/, (_m, l: string) => `=${FR_VERS_EN[l]}`);
}

export interface EnTetePGN {
  blancs: string;
  noirs: string;
  /** « 1-0 », « 0-1 », « 1/2-1/2 » ou « * » si la partie n'est pas terminée. */
  resultat: '1-0' | '0-1' | '1/2-1/2' | '*';
  date?: Date;
  eloBlancs?: number;
  eloNoirs?: number;
  ouverture?: string | null;
}

const deuxChiffres = (n: number): string => String(n).padStart(2, '0');

/** PGN complet : étiquettes, coups numérotés, résultat. */
export function versPGN(sansFrancais: string[], entete: EnTetePGN): string {
  const d = entete.date ?? new Date();
  const date = `${d.getFullYear()}.${deuxChiffres(d.getMonth() + 1)}.${deuxChiffres(d.getDate())}`;
  const etiquettes: [string, string][] = [
    ['Event', 'Partie amicale'],
    ['Site', 'Lotus Chess'],
    ['Date', date],
    ['White', entete.blancs],
    ['Black', entete.noirs],
    ['Result', entete.resultat],
  ];
  if (entete.eloBlancs) etiquettes.push(['WhiteElo', String(entete.eloBlancs)]);
  if (entete.eloNoirs) etiquettes.push(['BlackElo', String(entete.eloNoirs)]);
  if (entete.ouverture) etiquettes.push(['Opening', entete.ouverture]);

  const tete = etiquettes.map(([k, v]) => `[${k} "${v.replace(/"/g, "'")}"]`).join('\n');
  const coups = sansFrancais
    .map((san, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${versAnglais(san)}`)
    .join(' ');
  return `${tete}\n\n${coups} ${entete.resultat}`.trim() + '\n';
}
