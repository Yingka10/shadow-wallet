import { readFileSync } from 'fs';
import { join } from 'path';

describe('settle weekly interest migration', () => {
  it('drops the legacy signature before creating the jsonb function', () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        'supabase',
        'migrations',
        '20260705050000_fn_settle_weekly_interest.sql',
      ),
      'utf8',
    );

    const dropIndex = sql.indexOf(
      'DROP FUNCTION IF EXISTS public.settle_weekly_interest();',
    );
    const createIndex = sql.indexOf(
      'CREATE FUNCTION public.settle_weekly_interest()',
    );

    expect(dropIndex).toBeGreaterThanOrEqual(0);
    expect(createIndex).toBeGreaterThan(dropIndex);
  });
});
