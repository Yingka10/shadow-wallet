import { readFileSync } from 'fs';
import { join } from 'path';

describe('Cheng-en reading demo finalizer migration', () => {
  it('keeps daily reading unmonetized and verifies the demo was created', () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        'supabase',
        'migrations',
        '20260727000002_finalize_cheng_en_reading_demo.sql',
      ),
      'utf8',
    );

    expect(sql).toContain("c.nickname = '承恩'");
    expect(sql).toContain("t.name = '自主閱讀計畫'");
    expect(sql).toContain('coin_override = 0');
    expect(sql).toContain('UPDATE public.child_tasks');
    expect(sql).toContain('SET is_active = true');
    expect(sql).toContain('IF v_goal_count = 0 THEN');
    expect(sql).toContain("RAISE EXCEPTION 'Cheng-en reading demo was not created'");
  });
});
