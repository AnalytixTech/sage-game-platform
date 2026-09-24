import { AnyGameRules, Game } from '@sagegames/types';
import { memoryMatchRules } from '@sagegames/game-memory-match';
import { quizMasterRules } from '@sagegames/game-quiz-master';
import { sudokuRules } from '@sagegames/game-sudoku';
import { wordRushRules } from '@sagegames/game-word-rush';
import { wordSearchRules } from '@sagegames/game-word-search';
import { Queryable } from './db/db';

export interface CatalogEntry {
  game: Omit<Game, 'id'>;
  rules: AnyGameRules;
}

const platforms: Game['supportedPlatforms'] = ['web', 'ios', 'android'];

/** Every game the server can verify. The catalog table is synced from this at startup. */
export const CATALOG: CatalogEntry[] = [
  {
    rules: quizMasterRules,
    game: {
      slug: 'quiz-master',
      name: 'Quiz Master',
      description: 'Timed trivia across general knowledge, science, geography and more. Hosts can bring their own questions.',
      version: '2.0.0',
      category: 'quiz',
      status: 'published',
      deliveryModel: 'sdk_rendered',
      supportedPlatforms: platforms,
      thumbnail: 'https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?auto=format&w=400',
    },
  },
  {
    rules: wordRushRules,
    game: {
      slug: 'word-rush',
      name: 'Word Rush',
      description: 'Chain adjacent letter tiles into as many words as you can before the timer runs out.',
      version: '2.0.0',
      category: 'word',
      status: 'published',
      deliveryModel: 'sdk_rendered',
      supportedPlatforms: platforms,
      thumbnail: 'https://images.unsplash.com/photo-1546776310-eef45dd6d63c?auto=format&w=400',
    },
  },
  {
    rules: memoryMatchRules,
    game: {
      slug: 'memory-match',
      name: 'Memory Match',
      description: 'Flip cards and find every matching pair in as few moves as possible.',
      version: '2.0.0',
      category: 'memory',
      status: 'published',
      deliveryModel: 'sdk_rendered',
      supportedPlatforms: platforms,
      thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&w=400',
    },
  },
  {
    rules: wordSearchRules,
    game: {
      slug: 'word-search',
      name: 'Word Search',
      description: 'Find hidden words in a letter grid. Hosts can supply their own word lists and categories.',
      version: '2.0.0',
      category: 'word',
      status: 'published',
      deliveryModel: 'sdk_rendered',
      supportedPlatforms: platforms,
      thumbnail: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&w=400',
    },
  },
  {
    rules: sudokuRules,
    game: {
      slug: 'sudoku-arena',
      name: 'Sudoku Arena',
      description: 'Sudoku from 4x4 to 9x9, including irregular regions, with notes and hints.',
      version: '2.0.0',
      category: 'puzzle',
      status: 'published',
      deliveryModel: 'sdk_rendered',
      supportedPlatforms: platforms,
      thumbnail: 'https://images.unsplash.com/photo-1580541832626-2a7131ee809f?auto=format&w=400',
    },
  },
];

const byId = new Map(CATALOG.map((entry) => [entry.rules.gameId, entry]));

export function rulesFor(gameId: string): AnyGameRules | null {
  return byId.get(gameId)?.rules ?? null;
}

export const ALL_GAME_IDS = CATALOG.map((entry) => entry.rules.gameId);

/** Upsert the code-defined catalog into the games table. */
export async function syncCatalog(q: Queryable): Promise<void> {
  for (const { rules, game } of CATALOG) {
    await q.query(
      `INSERT INTO games (id, slug, name, description, version, category, status, delivery_model, thumbnail, supported_platforms, rules_version, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       ON CONFLICT (id) DO UPDATE SET
         slug = EXCLUDED.slug, name = EXCLUDED.name, description = EXCLUDED.description,
         version = EXCLUDED.version, category = EXCLUDED.category, status = EXCLUDED.status,
         delivery_model = EXCLUDED.delivery_model, thumbnail = EXCLUDED.thumbnail,
         supported_platforms = EXCLUDED.supported_platforms, rules_version = EXCLUDED.rules_version,
         updated_at = now()`,
      [
        rules.gameId,
        game.slug,
        game.name,
        game.description ?? null,
        game.version,
        game.category,
        game.status,
        game.deliveryModel,
        game.thumbnail ?? null,
        game.supportedPlatforms,
        rules.rulesVersion,
      ]
    );
  }
}

export interface GameRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  version: string;
  category: Game['category'];
  status: Game['status'];
  delivery_model: Game['deliveryModel'];
  thumbnail: string | null;
  supported_platforms: Game['supportedPlatforms'];
  rules_version: number;
}

export function toGame(row: GameRow): Game & { rulesVersion: number } {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? undefined,
    version: row.version,
    category: row.category,
    status: row.status,
    deliveryModel: row.delivery_model,
    thumbnail: row.thumbnail ?? undefined,
    supportedPlatforms: row.supported_platforms,
    rulesVersion: row.rules_version,
  };
}
