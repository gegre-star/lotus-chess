/**
 * Partager un texte (PGN, FEN) vers l'extérieur de l'application.
 *
 * Sur iPhone Safari, `navigator.share` ouvre la feuille de partage native — la
 * façon naturelle d'envoyer une partie à quelqu'un ou de la mettre dans
 * chess.com. À défaut, on copie dans le presse-papiers ; à défaut encore, dans
 * une application native, on passe par l'API `Share` de React Native.
 *
 * Rend ce qui s'est réellement passé, pour que l'écran puisse le dire :
 * afficher « copié » sans l'avoir fait est pire que de ne rien afficher.
 */
import { Share } from 'react-native';

export type IssuePartage = 'partage' | 'copie' | 'echec';

interface NavigateurPartage {
  share?: (donnees: { title?: string; text?: string }) => Promise<void>;
  clipboard?: { writeText?: (texte: string) => Promise<void> };
}

export async function partager(texte: string, titre: string): Promise<IssuePartage> {
  const nav: NavigateurPartage | undefined =
    typeof navigator !== 'undefined' ? (navigator as unknown as NavigateurPartage) : undefined;

  if (nav?.share) {
    try {
      await nav.share({ title: titre, text: texte });
      return 'partage';
    } catch (e) {
      // l'utilisateur a fermé la feuille : ce n'est pas une panne, on s'arrête là
      if ((e as { name?: string })?.name === 'AbortError') return 'echec';
    }
  }
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(texte);
      return 'copie';
    } catch {
      // le presse-papiers exige un geste et une page sécurisée : on tente la suite
    }
  }
  try {
    const r = await Share.share({ title: titre, message: texte });
    return r.action === Share.sharedAction ? 'partage' : 'echec';
  } catch {
    return 'echec';
  }
}
