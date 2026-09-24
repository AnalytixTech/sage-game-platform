import { SudokuVariantId } from '@sagegames/types';

export interface VariantConfig {
  id: SudokuVariantId;
  name: string;
  size: number;
  boxWidth: number;
  boxHeight: number;
  /** Irregular variants define their regions explicitly. */
  regionMap?: number[][];
}

export const VARIANT_CONFIGS: Record<SudokuVariantId, VariantConfig> = {
  '4x4': { id: '4x4', name: '4x4 Mini', size: 4, boxWidth: 2, boxHeight: 2 },
  '4x4_irregular': {
    id: '4x4_irregular',
    name: '4x4 Irregular',
    size: 4,
    boxWidth: 2,
    boxHeight: 2,
    regionMap: [
      [0, 0, 0, 1],
      [0, 2, 1, 1],
      [2, 2, 1, 3],
      [2, 3, 3, 3],
    ],
  },
  '5x5_irregular': {
    id: '5x5_irregular',
    name: '5x5 Irregular',
    size: 5,
    boxWidth: 5,
    boxHeight: 1,
    regionMap: [
      [0, 1, 1, 2, 2],
      [0, 0, 1, 2, 2],
      [0, 0, 1, 1, 2],
      [3, 3, 3, 4, 4],
      [3, 3, 4, 4, 4],
    ],
  },
  '6x6': { id: '6x6', name: '6x6 Standard', size: 6, boxWidth: 3, boxHeight: 2 },
  '6x6_irregular': {
    id: '6x6_irregular',
    name: '6x6 Irregular',
    size: 6,
    boxWidth: 3,
    boxHeight: 2,
    regionMap: [
      [0, 0, 0, 1, 1, 1],
      [0, 0, 2, 2, 1, 1],
      [0, 2, 2, 3, 3, 1],
      [4, 2, 2, 3, 3, 5],
      [4, 4, 3, 3, 5, 5],
      [4, 4, 4, 5, 5, 5],
    ],
  },
  '7x7_irregular': {
    id: '7x7_irregular',
    name: '7x7 Irregular',
    size: 7,
    boxWidth: 7,
    boxHeight: 1,
    regionMap: [
      [0, 0, 0, 1, 1, 1, 1],
      [0, 0, 0, 0, 1, 1, 1],
      [2, 2, 2, 3, 3, 4, 4],
      [2, 2, 2, 3, 4, 4, 4],
      [2, 5, 3, 3, 3, 3, 4],
      [5, 5, 6, 6, 6, 6, 4],
      [5, 5, 5, 5, 6, 6, 6],
    ],
  },
  '8x8': { id: '8x8', name: '8x8 Standard', size: 8, boxWidth: 4, boxHeight: 2 },
  '8x8_irregular': {
    id: '8x8_irregular',
    name: '8x8 Irregular',
    size: 8,
    boxWidth: 4,
    boxHeight: 2,
    regionMap: [
      [0, 0, 0, 0, 0, 1, 1, 1],
      [0, 0, 0, 2, 1, 1, 1, 1],
      [2, 2, 2, 2, 2, 3, 3, 1],
      [2, 2, 4, 4, 3, 3, 3, 3],
      [4, 4, 4, 4, 3, 3, 5, 5],
      [6, 4, 4, 5, 5, 5, 5, 5],
      [6, 6, 6, 6, 7, 7, 7, 5],
      [6, 6, 6, 7, 7, 7, 7, 7],
    ],
  },
  '9x9': { id: '9x9', name: '9x9 Classic', size: 9, boxWidth: 3, boxHeight: 3 },
};

export const VARIANT_IDS = Object.keys(VARIANT_CONFIGS) as SudokuVariantId[];

/** Region id for every cell, flattened row-major. */
export function regionsFor(variant: VariantConfig): number[] {
  const { size, boxWidth, boxHeight, regionMap } = variant;
  const regions: number[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (regionMap) {
        regions.push(regionMap[r][c]);
      } else {
        const boxesPerRow = size / boxWidth;
        regions.push(Math.floor(r / boxHeight) * boxesPerRow + Math.floor(c / boxWidth));
      }
    }
  }
  return regions;
}
