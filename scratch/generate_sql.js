const fs = require('fs');

const data = JSON.parse(fs.readFileSync('extracted.json', 'utf-8'));
const tasksData = data['分齡任務庫'];

// Remove the header row
tasksData.shift();

const ageGroups = [
  { id: '2-4', min: 2, max: 3 },
  { id: '4-6', min: 4, max: 5 },
  { id: '6-9', min: 6, max: 8 },
  { id: '9-12', min: 9, max: 12 }
];

let sql = `TRUNCATE TABLE public.system_task_templates;\n\n`;
sql += `INSERT INTO public.system_task_templates (name, category, age_group, base_time_min, difficulty, time_saving_min, sort_order)\nVALUES\n`;

const values = [];
let sortOrder = 1;

for (const row of tasksData) {
  const category = row['分齡任務庫底稿（60 項，台灣在地化）'];
  const name = row['__EMPTY'];
  const minAge = parseInt(row['__EMPTY_3'], 10);
  const maxAge = parseInt(row['__EMPTY_4'], 10);
  
  let baseTimeMin = row['__EMPTY_8'];
  if (baseTimeMin === '特殊' || isNaN(parseInt(baseTimeMin))) baseTimeMin = 0;
  else baseTimeMin = parseInt(baseTimeMin);
  
  let difficulty = parseFloat(row['__EMPTY_9']);
  if (isNaN(difficulty)) difficulty = 1.0;
  
  if (!name || !category || isNaN(minAge) || isNaN(maxAge)) continue;

  for (const group of ageGroups) {
    // If the task's age range overlaps with the group's age range
    if (minAge <= group.max && maxAge >= group.min) {
      // Escape single quotes in name
      const safeName = name.replace(/'/g, "''");
      values.push(`  ('${safeName}', '${category}', '${group.id}', ${baseTimeMin}, ${difficulty}, 0, ${sortOrder})`);
      sortOrder++;
    }
  }
}

sql += values.join(',\n') + ';\n';

fs.writeFileSync('seed.sql', sql);
console.log('Generated seed.sql');
