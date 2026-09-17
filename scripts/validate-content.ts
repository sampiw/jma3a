import fs from 'fs';
import path from 'path';

interface IntrusContent {
  words: Array<{ id: string; word: string; locale: string; category: string; difficulty: string }>;
  pairs: Array<{ id: string; wordA: string; wordB: string; locale: string; category: string; difficulty: string }>;
}

interface ChkonFinaContent {
  prompts: Array<{ id: string; prompt: string; locale: string; category: string }>;
}

interface MettelhaContent {
  prompts: Array<{ id: string; prompt: string; locale: string; category: string; difficulty: string }>;
}

interface Mamnou3Content {
  cards: Array<{ id: string; target: string; forbidden: string[]; locale: string; category: string; difficulty: string }>;
}

interface MissionSirriyaContent {
  missions: Array<{ id: string; instruction: string; locale: string; difficulty: string; estimatedDuration: string; tags: string[] }>;
}

function runValidation() {
  console.log('======================================================');
  console.log('JMA3A — CONTENT QUALITY & SCHEMA VALIDATION REPORT');
  console.log('======================================================\n');

  const contentDir = path.join(process.cwd(), 'content');
  const allIds = new Set<string>();
  let hasErrors = false;

  function checkId(id: string, file: string) {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      console.error(`[ERROR] Empty or invalid ID in ${file}`);
      hasErrors = true;
    }
    if (allIds.has(id)) {
      console.error(`[ERROR] Duplicate ID detected: "${id}" in ${file}`);
      hasErrors = true;
    }
    allIds.add(id);
  }

  function checkSafeText(text: string, fieldName: string, id: string) {
    if (!text || text.trim().length === 0) {
      console.error(`[ERROR] Empty text for ${fieldName} in ${id}`);
      hasErrors = true;
    }
    const lower = text.toLowerCase();
    if (lower.includes('lorem ipsum') || lower.includes('todo') || lower.includes('test prompt')) {
      console.error(`[ERROR] Placeholder/unsafe text detected in ${id}: "${text}"`);
      hasErrors = true;
    }
  }

  // 1. L'INTRUS
  console.log('1. Validating L\'INTRUS (content/intrus.json)...');
  const intrus: IntrusContent = JSON.parse(fs.readFileSync(path.join(contentDir, 'intrus.json'), 'utf8'));
  console.log(`   - Words found: ${intrus.words.length} (minimum: 120)`);
  console.log(`   - Pairs found: ${intrus.pairs.length} (minimum: 80)`);

  if (intrus.words.length < 120) {
    console.error(`[ERROR] L'Intrus words count ${intrus.words.length} < 120 minimum`);
    hasErrors = true;
  }
  if (intrus.pairs.length < 80) {
    console.error(`[ERROR] L'Intrus pairs count ${intrus.pairs.length} < 80 minimum`);
    hasErrors = true;
  }

  intrus.words.forEach(w => {
    checkId(w.id, 'intrus.words');
    checkSafeText(w.word, 'word', w.id);
    if (!w.category || !w.locale) {
      console.error(`[ERROR] Missing category or locale in ${w.id}`);
      hasErrors = true;
    }
  });

  intrus.pairs.forEach(p => {
    checkId(p.id, 'intrus.pairs');
    checkSafeText(p.wordA, 'wordA', p.id);
    checkSafeText(p.wordB, 'wordB', p.id);
  });
  console.log('   ✓ L\'Intrus schema & checks passed.\n');

  // 2. CHKON FINA
  console.log('2. Validating CHKON FINA (content/chkon-fina.json)...');
  const chkonFina: ChkonFinaContent = JSON.parse(fs.readFileSync(path.join(contentDir, 'chkon-fina.json'), 'utf8'));
  console.log(`   - Prompts found: ${chkonFina.prompts.length} (minimum: 180)`);
  const darijaCount = chkonFina.prompts.filter(p => p.locale === 'darija').length;
  console.log(`   - Darija prompts: ${darijaCount} (minimum: 100)`);

  if (chkonFina.prompts.length < 180) {
    console.error(`[ERROR] Chkon Fina prompts count ${chkonFina.prompts.length} < 180 minimum`);
    hasErrors = true;
  }
  if (darijaCount < 100) {
    console.error(`[ERROR] Chkon Fina Darija count ${darijaCount} < 100 minimum`);
    hasErrors = true;
  }

  chkonFina.prompts.forEach(p => {
    checkId(p.id, 'chkon-fina');
    checkSafeText(p.prompt, 'prompt', p.id);
  });
  console.log('   ✓ Chkon Fina schema & checks passed.\n');

  // 3. METTELHA
  console.log('3. Validating METTELHA (content/mettelha.json)...');
  const mettelha: MettelhaContent = JSON.parse(fs.readFileSync(path.join(contentDir, 'mettelha.json'), 'utf8'));
  console.log(`   - Acting prompts found: ${mettelha.prompts.length} (minimum: 250)`);

  if (mettelha.prompts.length < 250) {
    console.error(`[ERROR] Mettelha prompts count ${mettelha.prompts.length} < 250 minimum`);
    hasErrors = true;
  }

  mettelha.prompts.forEach(p => {
    checkId(p.id, 'mettelha');
    checkSafeText(p.prompt, 'prompt', p.id);
  });
  console.log('   ✓ Mettelha schema & checks passed.\n');

  // 4. MAMNOU3
  console.log('4. Validating MAMNOU3 (content/mamnou3.json)...');
  const mamnou3: Mamnou3Content = JSON.parse(fs.readFileSync(path.join(contentDir, 'mamnou3.json'), 'utf8'));
  console.log(`   - Taboo cards found: ${mamnou3.cards.length} (minimum: 180)`);

  if (mamnou3.cards.length < 180) {
    console.error(`[ERROR] Mamnou3 cards count ${mamnou3.cards.length} < 180 minimum`);
    hasErrors = true;
  }

  mamnou3.cards.forEach(c => {
    checkId(c.id, 'mamnou3');
    checkSafeText(c.target, 'target', c.id);
    if (!c.forbidden || c.forbidden.length < 3 || c.forbidden.length > 5) {
      console.error(`[ERROR] Card ${c.id} must have 3 to 5 forbidden words. Found: ${c.forbidden?.length}`);
      hasErrors = true;
    }
    c.forbidden.forEach((f, idx) => checkSafeText(f, `forbidden[${idx}]`, c.id));
  });
  console.log('   ✓ Mamnou3 schema & checks passed.\n');

  // 5. MISSION SIRRIYA
  console.log('5. Validating MISSION SIRRIYA (content/mission-sirriya.json)...');
  const missionSirriya: MissionSirriyaContent = JSON.parse(fs.readFileSync(path.join(contentDir, 'mission-sirriya.json'), 'utf8'));
  console.log(`   - Missions found: ${missionSirriya.missions.length} (minimum: 120)`);

  if (missionSirriya.missions.length < 120) {
    console.error(`[ERROR] Mission Sirriya count ${missionSirriya.missions.length} < 120 minimum`);
    hasErrors = true;
  }

  missionSirriya.missions.forEach(m => {
    checkId(m.id, 'mission-sirriya');
    checkSafeText(m.instruction, 'instruction', m.id);
  });
  console.log('   ✓ Mission Sirriya schema & checks passed.\n');

  console.log('======================================================');
  console.log(`TOTAL SEED CONTENT ITEMS VALIDATED: ${allIds.size}`);
  if (hasErrors) {
    console.error('FAILED: Content validation encountered errors.');
    process.exit(1);
  } else {
    console.log('SUCCESS: All content packs strictly verified with ZERO errors!');
    console.log('======================================================\n');
  }
}

runValidation();
