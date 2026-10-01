/**
 * Battle rooms live in memory, so a deployment must run exactly one API process. Each process
 * records a heartbeat in the database and warns when it sees another live one (expected for a
 * moment during a rolling deploy; a lasting warning means more than one replica is running).
 */
import crypto from 'crypto';
import { Db } from '../db/db';
import { Logger } from '../observability/logger';

const BEAT_MS = 30_000;
const STALE_MS = 90_000;

export function startInstanceHeartbeat(db: Db, logger: Logger, now: () => Date = () => new Date()): { id: string; stop: () => Promise<void> } {
  const id = `${process.env.RAILWAY_REPLICA_ID ?? process.env.RENDER_INSTANCE_ID ?? 'api'}-${crypto.randomBytes(4).toString('hex')}`;
  const startedAt = now();
  let warned = false;

  const beat = async () => {
    const t = now();
    const updated = await db.updateTable('sagegames_instances').set({ last_seen_at: t }).where('id', '=', id).executeTakeFirst();
    if (Number(updated.numUpdatedRows) === 0) {
      await db.insertInto('sagegames_instances').values({ id, started_at: startedAt, last_seen_at: t }).execute();
    }
    await db.deleteFrom('sagegames_instances').where('last_seen_at', '<', new Date(t.getTime() - 24 * 3600_000)).execute();
    const others = await db
      .selectFrom('sagegames_instances')
      .select(['id', 'started_at'])
      .where('id', '<>', id)
      .where('last_seen_at', '>', new Date(t.getTime() - STALE_MS))
      .execute();
    if (others.length && !warned) {
      warned = true;
      logger.warn('another API instance is using this database; run exactly one (battles are held in memory)', {
        component: 'instances',
        instance: id,
        others: others.map((o) => o.id),
      });
    } else if (!others.length) {
      warned = false;
    }
  };

  const run = () => beat().catch((err) => logger.warn('instance heartbeat failed', { component: 'instances', err }));
  void run();
  const timer = setInterval(run, BEAT_MS);
  timer.unref();
  return {
    id,
    stop: async () => {
      clearInterval(timer);
      await db.deleteFrom('sagegames_instances').where('id', '=', id).execute().catch(() => undefined);
    },
  };
}
