import { readFileSync } from 'fs';
import { join } from 'path';

describe('Cheng-en reading demo migration', () => {
  it('adds the weekday reading plan idempotently without hard-coded ids', () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        'supabase',
        'migrations',
        '20260727000001_seed_cheng_en_reading_demo.sql',
      ),
      'utf8',
    );

    expect(sql).toContain("c.nickname = '承恩'");
    expect(sql).toContain("'自主閱讀計畫'");
    expect(sql).toContain('ARRAY[1,2,3,4,5]');
    expect(sql).toContain("'after_dinner'");
    expect(sql).toContain('\'{"5": 10}\'::jsonb');
    expect(sql).toContain('WHERE NOT EXISTS');
  });
});
