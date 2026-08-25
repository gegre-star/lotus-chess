import { emptyAccumulator, readInfo, readBestMove, toAnalysis } from '../uci';

/**
 * Les lignes utilisées ici sont des sorties réelles de Stockfish 18 Lite,
 * relevées sur la position d'Adams — Torre (mat en 3 par 1...Dd1+).
 */
const ADAMS = [
  'info string NNUE evaluation using nn-9067e33176e8.nnue',
  'info depth 1 seldepth 4 multipv 1 score cp -429 nodes 63 nps 7000 hashfull 0 time 9 pv b7b6',
  'info depth 5 seldepth 11 multipv 1 score cp -410 nodes 662 nps 60181 hashfull 0 time 11 pv b8c8 e3a7 b7b5 a7a8 c8c7',
  'info depth 6 seldepth 8 multipv 1 score mate 3 nodes 1169 nps 97416 hashfull 0 time 12 pv d6d1 c1d1 d7g4 d1c1 d8d1',
  'bestmove d6d1 ponder c1d1',
];

const digest = (lines: string[]) => {
  let acc = emptyAccumulator();
  let best: string | null = null;
  lines.forEach((line) => {
    acc = readInfo(acc, line);
    const b = readBestMove(line);
    if (b !== null || line.startsWith('bestmove')) best = b;
  });
  return toAnalysis(acc, best);
};

describe('lecture du protocole UCI', () => {
  it('retient la dernière profondeur analysée', () => {
    const a = digest(ADAMS);
    expect(a.depth).toBe(6);
    expect(a.best).toBe('d6d1');
  });

  it('annonce le mat et efface le score en centièmes', () => {
    const a = digest(ADAMS);
    expect(a.mate).toBe(3);
    expect(a.cp).toBeNull();
  });

  it('lit la variante principale en entier', () => {
    expect(digest(ADAMS).pv).toEqual(['d6d1', 'c1d1', 'd7g4', 'd1c1', 'd8d1']);
  });

  it('lit un score négatif en centièmes de pion', () => {
    const acc = readInfo(emptyAccumulator(), ADAMS[1]);
    expect(acc.cp).toBe(-429);
    expect(acc.mate).toBeNull();
  });

  it('ignore les lignes de commentaire sans score', () => {
    const acc = readInfo(emptyAccumulator(), ADAMS[0]);
    expect(acc).toEqual(emptyAccumulator());
  });

  it('ignore les scores bornés, qui sont des évaluations partielles', () => {
    const base = readInfo(emptyAccumulator(), ADAMS[1]);
    const borne = 'info depth 9 multipv 1 score cp 300 upperbound nodes 12 pv a1a2';
    expect(readInfo(base, borne)).toEqual(base);
  });

  it('reconnaît une position sans coup jouable', () => {
    expect(readBestMove('bestmove (none)')).toBeNull();
    expect(readBestMove('bestmove 0000')).toBeNull();
  });

  it('ne prend pas une ligne info pour un bestmove', () => {
    expect(readBestMove(ADAMS[1])).toBeNull();
  });

  it('lit un mat annoncé contre soi', () => {
    const acc = readInfo(emptyAccumulator(), 'info depth 4 score mate -2 pv h7h8 g1g2');
    expect(acc.mate).toBe(-2);
  });
});
