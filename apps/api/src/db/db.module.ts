import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { AppConfig, CONFIG } from '../config';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;
export const DB = Symbol('DB');
const POOL = Symbol('POOL');

export const InjectDb = () => Inject(DB);

@Global()
@Module({
  providers: [
    {
      provide: POOL,
      inject: [CONFIG],
      useFactory: (config: AppConfig) => new Pool({ connectionString: config.databaseUrl }),
    },
    {
      provide: DB,
      inject: [POOL],
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
    },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
