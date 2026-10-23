/** The 16 C64 colours (Colodore palette by Pepto). Index = C64 colour number. */
export const C64 = [
  '#000000', // 0 black
  '#ffffff', // 1 white
  '#813338', // 2 red
  '#75cec8', // 3 cyan
  '#8e3c97', // 4 purple
  '#56ac4d', // 5 green
  '#2e2c9b', // 6 blue
  '#edf171', // 7 yellow
  '#8e5029', // 8 orange
  '#553800', // 9 brown
  '#c46c71', // 10 light red
  '#4a4a4a', // 11 dark grey
  '#7b7b7b', // 12 grey
  '#a9ff9f', // 13 light green
  '#706deb', // 14 light blue
  '#b2b2b2', // 15 light grey
] as const;

export enum Col {
  Black = 0,
  White = 1,
  Red = 2,
  Cyan = 3,
  Purple = 4,
  Green = 5,
  Blue = 6,
  Yellow = 7,
  Orange = 8,
  Brown = 9,
  LightRed = 10,
  DarkGrey = 11,
  Grey = 12,
  LightGreen = 13,
  LightBlue = 14,
  LightGrey = 15,
}

export const col = (i: number): string => C64[i & 15]!;
