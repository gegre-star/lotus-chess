/**
 * Rend `public/icone-maskable-512.png`, l'icône « maskable » du manifeste.
 *
 * Android découpe les icônes maskables selon la forme choisie par le lanceur
 * (cercle, goutte, carré arrondi…) : le fond doit donc être PLEIN jusqu'aux
 * bords, et le motif tenir dans la zone sûre, le cercle central de rayon 40 %
 * de la largeur (80 % de diamètre). Les icônes `any` (fond vert, pion à
 * l'échelle 0,66) ne conviennent pas : leur pion, plus petit, laisse trop de
 * fond, alors qu'ici on l'agrandit tout en le gardant dans le cercle.
 *
 * Le pion est celui de `src/components/ChessPiece.tsx` (même tracé, mêmes
 * couleurs) et le vert est celui des icônes existantes, relevé pixel par pixel.
 *
 * Playwright n'est PAS une dépendance du projet : cet outil ne sert qu'à
 * régénérer l'icône, qui est versionnée. Pour le lancer :
 *   PLAYWRIGHT_MODULE=/chemin/vers/playwright/index.mjs \
 *   CHROMIUM_PATH=/chemin/vers/chrome node scripts/generer-icone-maskable.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TAILLE = 512;
const FOND = '#81b64c';
// Tracé du pion, sur la grille 45 × 45 de ChessPiece.tsx
const PION =
  'M22.5 9c-2.2 0-4 1.8-4 4 0 .9.3 1.7.8 2.4A7 7 0 0 0 16 21c0 2 .9 3.8 2.4 5-3 1.1-7.4 5.6-7.4 13.5h23c0-7.9-4.4-12.4-7.4-13.5a6.5 6.5 0 0 0 2.4-5c0-2.4-1.3-4.5-3.3-5.6.5-.7.8-1.5.8-2.4 0-2.2-1.8-4-4-4z';

// Pixels par unité de grille. Les icônes `any` utilisent ≈ 7,5 ; on agrandit de
// 20 % : la diagonale du pion (≈ 181 px de demi-longueur) reste sous les
// 204,8 px de rayon de la zone sûre. Vérifié par mesure après rendu (ci-dessous).
const ECHELLE = 9;
// centre du pion sur la grille, mesuré : x = 22,5 ; y = milieu de 9 et 39,5
const CENTRE = { x: 22.5, y: 24.25 };

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TAILLE}" height="${TAILLE}" viewBox="0 0 ${TAILLE} ${TAILLE}">
  <rect width="${TAILLE}" height="${TAILLE}" fill="${FOND}"/>
  <g transform="translate(${TAILLE / 2} ${TAILLE / 2}) scale(${ECHELLE}) translate(${-CENTRE.x} ${-CENTRE.y})">
    <path d="${PION}" fill="#fafaf8" stroke="#3a3733" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
</svg>`;

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const navigateur = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
try {
  const page = await navigateur.newPage({ viewport: { width: TAILLE, height: TAILLE } });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: TAILLE, height: TAILLE } });

  // Contrôle de la zone sûre : on mesure les pixels qui ne sont pas du fond
  const pixels = await page.evaluate(async (dataUrl) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = img.width;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data, width } = ctx.getImageData(0, 0, c.width, c.height);
    let pire = 0;
    for (let i = 0; i < data.length; i += 4) {
      const horsFond = Math.abs(data[i] - 129) > 12 || Math.abs(data[i + 1] - 182) > 12 || Math.abs(data[i + 2] - 76) > 12;
      if (!horsFond) continue;
      const p = i / 4;
      pire = Math.max(pire, Math.hypot((p % width) + 0.5 - width / 2, Math.floor(p / width) + 0.5 - width / 2));
    }
    // les quatre coins doivent être du fond plein (pas de transparence)
    const coins = [0, width - 1].flatMap((x) => [0, width - 1].map((y) => data[(y * width + x) * 4 + 3]));
    return { pire, coins };
  }, `data:image/png;base64,${png.toString('base64')}`);

  const rayonSur = TAILLE * 0.4;
  console.error(`motif : rayon max ${pixels.pire.toFixed(1)} px pour une zone sûre de ${rayonSur} px`);
  if (pixels.pire > rayonSur) throw new Error('le motif dépasse la zone sûre de 80 %');
  if (pixels.coins.some((a) => a !== 255)) throw new Error('le fond n\'est pas plein jusqu\'aux coins');

  const cible = fileURLToPath(new URL('../public/icone-maskable-512.png', import.meta.url));
  writeFileSync(cible, png);
  console.error(`écrit : ${cible}`);
} finally {
  await navigateur.close();
}
