/**
 * Sons et vibrations — version native : rien.
 *
 * Expo Go n'embarque pas de module audio dans cette configuration, et une
 * dépendance native de plus compliquerait l'installation pour un gain mineur.
 * Le web, où l'application est réellement utilisée sur iPhone, a la version
 * complète (`son.web.ts`).
 */
export type Effet = 'coup' | 'prise' | 'echec' | 'roque' | 'fin' | 'erreur' | 'promotion';

export function jouerSon(_effet: Effet, _reglages: { sound: boolean; vibration: boolean }): void {
  // rien à faire
}
