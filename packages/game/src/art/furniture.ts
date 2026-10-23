/**
 * Original furniture pixel art (wide pixels; hex digits are C64 colours, '.' transparent).
 * Each piece is placed with its bottom-left corner at (x, y). Pieces on the 'front' layer are
 * drawn after the people (bed blankets, bath tub) so people appear inside them.
 */
import { FEET } from '../world/layout.ts';

export interface Piece {
  id: string;
  rows: string[];
  x: number;
  /** Bottom row y. */
  y: number;
  layer?: 'back' | 'front';
}

const R = (n: number, row: string) => Array.from({ length: n }, () => row);

// ---------------------------------------------------------------- kitchen
const FRIDGE = [
  'fffffff',
  'f11111f',
  'f1111cf',
  'f11111f',
  'f11111f',
  'fffffff',
  'f11111f',
  'f1111cf',
  'f1111cf',
  'f1111cf',
  ...R(8, 'f11111f'),
  'fffffff',
  '.b...b.',
];
const STOVE = [
  'bbbbbbbb',
  'cccccccc',
  'c0c0c0cc',
  'cccccccc',
  'c000000c',
  'c0bbbb0c',
  'c0bbbb0c',
  'c000000c',
  'cccccccc',
  'cccccccc',
  'b......b',
];
const POT = ['c..c', 'cccc', 'bccb'];
const SINK = [
  '.....c...',
  '....ccc..',
  '.....c...',
  'fffffffff',
  '899989998',
  '898989898',
  '898989898',
  '898989898',
  '899989998',
  '888888888',
  '.9.....9.',
];
const UPPER_CABINET = ['888888888', '898989898', '898989898', '898989898', '888888888'];
const COOLER = [
  '.333.',
  '3eee3',
  '3eee3',
  '3eee3',
  '.333.',
  '.fff.',
  'fffff',
  'f0fff',
  'fffff',
  ...R(9, 'fcccf'),
  'fffff',
  '.c.c.',
];
const DOG_BOWL = ['2..2', '2222'];
const KITCHEN_LAMP = ['..c..', '..c..', '..c..', '..c..', '.777.', '77777'];

// ---------------------------------------------------------------- living room
const CHAIR_R = ['9....', '9....', '9....', '9....', '99999', '99999', '9...9', '9...9'];
const CHAIR_L = CHAIR_R.map((r) => [...r].reverse().join(''));
const CARD_TABLE = [
  '555555555',
  '999999999',
  '.9.....9.',
  '.9.....9.',
  '.9.....9.',
  '.9.....9.',
  '.9.....9.',
];
const PHONE_TABLE = [
  '.2222.',
  '222222',
  '999999',
  '.9..9.',
  '.9..9.',
  '.9..9.',
  '.9..9.',
  '.9..9.',
  '.9..9.',
  '.9..9.',
];
const ARMCHAIR_L = (c: string) =>
  [
    '.......cc.',
    '......cccc',
    '......cccc',
    '......cccc',
    '......cccc',
    '......cccc',
    '.ccccccccc',
    'cccccccccc',
    'cccccccccc',
    '.9......9.',
  ].map((r) => r.replace(/c/g, c));
const FLOOR_LAMP = ['.777.', '77777', ...R(14, '..c..'), '.ccc.'];
const FIREPLACE = [
  'ffffffffffffff',
  '.cccccccccccc.',
  '.cbccccccccbc.',
  ...R(11, '.cc00000000cc.'),
  '.cccccccccccc.',
  'bbbbbbbbbbbbbb',
];
const PICTURE = ['8888888', '8333338', '8335338', '8555558', '8555558', '8888888'];

// ---------------------------------------------------------------- bedroom
const BUNK = [
  ...R(5, '9..............9'),
  '9111111111111119',
  '9999999999999999',
  '9............c.9',
  '9............c.9',
  '9...........ccc9',
  '9............c.9',
  '9............c.9',
  '9...........ccc9',
  '9............c.9',
  '9............c.9',
  '9...........ccc9',
  '9............c.9',
  '9............c.9',
  '9............c.9',
  '9111111111111119',
  '9999999999999999',
  ...R(3, '9..............9'),
];
const BLANKET = (c: string) => [`11${c.repeat(12)}.`, `11${c.repeat(12)}.`, `.${c.repeat(13)}.`];
const CLOSET = [
  '999999999',
  '988889889',
  ...R(24, '988889889'),
  '988789789',
  ...R(2, '988889889'),
  '999999999',
  '.9.....9.',
].slice(0, 30);
const DRESSER = [
  '..fffffff..',
  '..f33333f..',
  '..f33313f..',
  '..f33333f..',
  '..f33333f..',
  '..fffffff..',
  '.....f.....',
  '99999999999',
  '98888888889',
  '98887888889',
  '98888888889',
  '98887888889',
  '98888888889',
  '99999999999',
  '.9.......9.',
];

// ---------------------------------------------------------------- bathroom
const BASIN = [
  'ffffff',
  'f3333f',
  'f3313f',
  'f3333f',
  'ffffff',
  '......',
  '..c...',
  'ffffff',
  '.ffff.',
  '..ff..',
  ...R(6, '..ff..'),
  '.ffff.',
];
const SHOWER_PIPE = ['ccccc..', 'c..cc..', 'c..ff..', ...R(20, 'c......')];
const TUB_FRONT = [
  'ffffffffffffff',
  '11111111111111',
  '11111111111111',
  '11111111111111',
  '.111111111111.',
  '.c..........c.',
];

// ---------------------------------------------------------------- computer corner
const BOOKSHELF = [
  '999999999',
  '927345e29',
  '927345e29',
  '927345e29',
  '999999999',
  '9e52a7349',
  '9e52a7349',
  '9e52a7349',
  '999999999',
  '94a3725d9',
  '94a3725d9',
  '94a3725d9',
  '999999999',
  '9d2e45379',
  '9d2e45379',
  '9d2e45379',
  '999999999',
  '9.......9',
  '9.......9',
  '999999999',
  '.9.....9.',
];
const DESK = [
  '99999999999',
  '98888888889',
  '98877788889',
  '98888888889',
  '9.......9.9',
  '9.......9.9',
  '9.......9.9',
  '9.......9.9',
  '9.......9.9',
];
const MONITOR = ['cccccc', 'c6666c', 'c6666c', 'c6666c', 'cccccc', '..cc..', '.cccc.'];
const BREADBIN = ['.fffff.', 'f0f0f0f'];

// ---------------------------------------------------------------- attic
const TV = [
  '..c..c..',
  '...cc...',
  '88888888',
  '80000008',
  '80000008',
  '80000008',
  '80000008',
  '88888888',
  '.9....9.',
  '.9....9.',
  '.9....9.',
];
const RECORD_PLAYER = [
  '.0000.c',
  '0000000',
  '9999999',
  '9888889',
  '98b8b89',
  '9888889',
  '9888889',
  '9999999',
  '.9...9.',
];
const RUG = ['777777777777777777', '7a7a7a7a7a7a7a7a77'];
const ORGAN = [
  '99999999....',
  '98888889....',
  '981f1f89....',
  '98888889....',
  '98888889.f..',
  '98888889ff..',
  '98888889....',
  '988888899999',
  '988888891010',
  '988888899999',
  ...R(4, '98888889....'),
  '988888899...',
  '99999999999.',
];
const BENCH = ['99999', '9...9', '9...9', '9...9'];
const STUDY_DOOR = ['fffffff', ...R(10, 'f11111f'), 'f111171', ...R(13, 'f11111f'), 'fffffff'];
const TYPEWRITER = ['..11..', '..11..', 'cccccc', 'c0c0cc'];
const FILE_CABINET = [
  'cccccc',
  'cbbbbc',
  'cccccc',
  'cc00cc',
  'cccccc',
  'cbbbbc',
  'cccccc',
  'cc00cc',
  'cccccc',
  'cbbbbc',
  'cccccc',
  'cc00cc',
  'cccccc',
  'cccccc',
  '.c..c.',
];
const DUMBBELLS = ['cc.cc', '.ccc.', 'cc.cc', '.....', 'cc.cc', '.ccc.', 'cc.cc', 'b...b', 'bbbbb', 'b...b'];
const ROUND_WINDOW = [
  '..9999..',
  '.933339.',
  '93333339',
  '93393339',
  '99999999',
  '93393339',
  '.933339.',
  '..9999..',
];
const KITCHEN_WINDOW = [
  '999999999',
  '933393339',
  '933393339',
  '933393339',
  '999999999',
  '933393339',
  '933393339',
  '999999999',
];

const F0 = FEET[0];
const F1 = FEET[1];
const F2 = FEET[2];

export const PIECES: Piece[] = [
  // kitchen (0)
  { id: 'kitchen-window', rows: KITCHEN_WINDOW, x: 62, y: 166 },
  { id: 'upper-cabinet', rows: UPPER_CABINET, x: 44, y: 160 },
  { id: 'kitchen-lamp', rows: KITCHEN_LAMP, x: 25, y: 151 },
  { id: 'fridge', rows: FRIDGE, x: 10, y: F0 },
  { id: 'stove', rows: STOVE, x: 26, y: F0 },
  { id: 'pot', rows: POT, x: 32, y: F0 - 11 },
  { id: 'sink', rows: SINK, x: 44, y: F0 },
  { id: 'dog-bowl', rows: DOG_BOWL, x: 66, y: F0 },
  { id: 'cooler', rows: COOLER, x: 84, y: F0 },
  // living room (0)
  { id: 'chair-l', rows: CHAIR_R, x: 136, y: F0 },
  { id: 'card-table', rows: CARD_TABLE, x: 149, y: F0 },
  { id: 'chair-r', rows: CHAIR_L, x: 170, y: F0 },
  { id: 'phone-table', rows: PHONE_TABLE, x: 186, y: F0 },
  { id: 'armchair', rows: ARMCHAIR_L('4'), x: 213, y: F0 },
  { id: 'floor-lamp', rows: FLOOR_LAMP, x: 233, y: F0 },
  { id: 'picture', rows: PICTURE, x: 247, y: 158 },
  { id: 'fireplace', rows: FIREPLACE, x: 240, y: F0 },
  // bedroom (1)
  { id: 'bunk', rows: BUNK, x: 10, y: F1 },
  { id: 'closet', rows: CLOSET, x: 46, y: F1 },
  { id: 'dresser', rows: DRESSER, x: 68, y: F1 },
  // bathroom (1)
  { id: 'basin', rows: BASIN, x: 136, y: F1 },
  { id: 'shower-pipe', rows: SHOWER_PIPE, x: 152, y: F1 - 4 },
  { id: 'tub-front', rows: TUB_FRONT, x: 150, y: F1, layer: 'front' },
  // computer corner (1)
  { id: 'bookshelf', rows: BOOKSHELF, x: 186, y: F1 },
  { id: 'desk1', rows: DESK, x: 206, y: F1 },
  { id: 'monitor1', rows: MONITOR, x: 210, y: F1 - 9 },
  { id: 'breadbin1', rows: BREADBIN, x: 216, y: F1 - 9 },
  { id: 'chair-c1', rows: CHAIR_L, x: 228, y: F1 },
  { id: 'desk2', rows: DESK, x: 240, y: F1 },
  { id: 'monitor2', rows: MONITOR, x: 244, y: F1 - 9 },
  { id: 'breadbin2', rows: BREADBIN, x: 250, y: F1 - 9 },
  { id: 'chair-c2', rows: CHAIR_L, x: 262, y: F1 },
  // attic (2)
  { id: 'tv', rows: TV, x: 12, y: F2 },
  { id: 'armchair-tv', rows: ARMCHAIR_L('5'), x: 30, y: F2 },
  { id: 'chair-tv', rows: CHAIR_L, x: 54, y: F2 },
  { id: 'rug', rows: RUG, x: 64, y: F2 },
  { id: 'record-player', rows: RECORD_PLAYER, x: 64, y: F2 - 2 },
  { id: 'round-window', rows: ROUND_WINDOW, x: 136, y: 58 },
  { id: 'organ', rows: ORGAN, x: 136, y: F2 },
  { id: 'bench', rows: BENCH, x: 160, y: F2 },
  { id: 'study-door', rows: STUDY_DOOR, x: 180, y: F2 },
  { id: 'desk3', rows: DESK, x: 196, y: F2 },
  { id: 'typewriter', rows: TYPEWRITER, x: 202, y: F2 - 9 },
  { id: 'chair-tw', rows: CHAIR_L, x: 218, y: F2 },
  { id: 'file-cabinet', rows: FILE_CABINET, x: 236, y: F2 },
  { id: 'dumbbells', rows: DUMBBELLS, x: 268, y: F2 },
];

export const BLANKETS = {
  low: { rows: BLANKET('e'), x: 12, y: F1 - 3 },
  high: { rows: BLANKET('2'), x: 12, y: F1 - 17 },
};

/** Animated bits, drawn by the house renderer each frame. */
export const ANIM = {
  fire: [
    ['....2...', '...282..', '..28782.', '.287782.', '28777782', '22222222'],
    ['...2....', '..282.2.', '.28782.2', '.2877822', '28777782', '22222222'],
    ['.....2..', '..2.282.', '.228782.', '.287782.', '28777782', '22222222'],
  ],
  embers: ['........', '........', '........', '........', '.2.2.2..', '22222222'],
  steam: [
    ['.f.', 'f..', '.f.'],
    ['f..', '.f.', '..f'],
  ],
  smoke: [
    ['.c..', 'c.c.', '.c..'],
    ['..c.', '.c.c', '..c.'],
  ],
  water: [
    ['3.3.3.3', '.3.3.3.', '3.3.3.3'],
    ['.3.3.3.', '3.3.3.3', '.3.3.3.'],
  ],
  note: ['.11', '.1.', '11.'],
  cards: ['1.1.1', '.....'],
  closetOpen: ['999999999', '9.......9', '9.2.5.e.9', '9.2.5.e.9', '9.2.5.e.9', '9.......9'],
  monitorText: [
    ['eeee', 'e.e.', 'ee.e'],
    ['e.ee', 'eee.', '.e.e'],
    ['ee.e', '.eee', 'e.e.'],
  ],
  tvShow: [
    ['3333', '3773', '5555', '5555'],
    ['3333', '3337', '5595', '5555'],
    ['ffff', 'cfcf', 'fcfc', 'cfcf'],
  ],
  zzz: ['111.', '..1.', '.1..', '111.'],
};
