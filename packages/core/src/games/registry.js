"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameRegistry = void 0;
class GameRegistry {
    games = new Map();
    constructor(initialGames = []) {
        initialGames.forEach((game) => this.register(game));
    }
    register(game) {
        this.games.set(game.id, game);
        if (game.slug) {
            this.games.set(game.slug, game);
        }
    }
    get(idOrSlug) {
        return this.games.get(idOrSlug);
    }
    list(filter) {
        const list = Array.from(new Set(this.games.values()));
        return list.filter((game) => {
            if (filter?.category && game.category !== filter.category) {
                return false;
            }
            if (filter?.status && game.status !== filter.status) {
                return false;
            }
            if (filter?.platform &&
                game.supportedPlatforms &&
                !game.supportedPlatforms.includes(filter.platform)) {
                return false;
            }
            return true;
        });
    }
    isSupportedOn(gameId, platform) {
        const game = this.get(gameId);
        if (!game)
            return false;
        return game.supportedPlatforms.includes(platform);
    }
}
exports.GameRegistry = GameRegistry;
//# sourceMappingURL=registry.js.map