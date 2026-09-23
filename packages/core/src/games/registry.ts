import { Game, GameCategory, Platform } from '@sagegames/types';

export class GameRegistry {
  private games: Map<string, Game> = new Map();

  constructor(initialGames: Game[] = []) {
    initialGames.forEach((game) => this.register(game));
  }

  public register(game: Game): void {
    this.games.set(game.id, game);
    if (game.slug) {
      this.games.set(game.slug, game);
    }
  }

  public get(idOrSlug: string): Game | undefined {
    return this.games.get(idOrSlug);
  }

  public list(filter?: { category?: GameCategory; platform?: Platform; status?: string }): Game[] {
    const list = Array.from(new Set(this.games.values()));
    return list.filter((game) => {
      if (filter?.category && game.category !== filter.category) {
        return false;
      }
      if (filter?.status && game.status !== filter.status) {
        return false;
      }
      if (
        filter?.platform &&
        game.supportedPlatforms &&
        !game.supportedPlatforms.includes(filter.platform)
      ) {
        return false;
      }
      return true;
    });
  }

  public isSupportedOn(gameId: string, platform: Platform): boolean {
    const game = this.get(gameId);
    if (!game) return false;
    return game.supportedPlatforms.includes(platform);
  }
}
