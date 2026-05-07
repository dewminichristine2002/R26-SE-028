const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const { parseCsvLine } = require('./csvLine');

const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'src', 'data', 'generated');
const outputPath = path.join(outputDir, 'medicationKnowledge.generated.json');

const defaultDatasetRoot = 'C:\\Users\\thyag\\OneDrive\\Desktop\\Y4S1\\Research\\Datasets';
const datasetRoot = process.env.MED_DATASET_ROOT || defaultDatasetRoot;

const config = {
  drugNamesPath: process.env.MED_SIDER_DRUG_NAMES_PATH || path.join(datasetRoot, 'drug_names.tsv'),
  sideEffectsPath: process.env.MED_SIDER_SIDE_EFFECTS_PATH || path.join(datasetRoot, 'meddra_all_se.tsv.gz'),
  rxnormZipPath: process.env.MED_RXNORM_ZIP_PATH || path.join(datasetRoot, 'RxNorm_full_prescribe_03022026 (1).zip'),
  ddinterGlobRoot: process.env.MED_DDINTER_ROOT || datasetRoot,
};

const normalizeText = (value) => (value == null ? '' : String(value).trim().toLowerCase());
const normalizeDrugName = (value) =>
  normalizeText(value)
    .replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|ml)\b/g, '')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const severityKeywords = [
  'anaphylaxis',
  'shock',
  'death',
  'bleeding',
  'hemorrhage',
  'renal failure',
  'liver failure',
  'respiratory failure',
  'stevens-johnson',
  'toxic epidermal necrolysis',
  'cardiac arrest',
];

const rxnormTtyPriority = {
  IN: 1,
  PIN: 2,
  MIN: 3,
  SCD: 4,
  SBD: 5,
  BN: 6,
  GPCK: 7,
  BPCK: 8,
  SCDC: 9,
  SBDC: 10,
  SCDG: 11,
  SBDG: 12,
  SCDGP: 13,
  SBDGP: 14,
  OTH: 99,
};

const parseZipEntries = async (zipPath) => {
  const command = [
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `$zip=[IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/'/g, "''")}')`,
    `$zip.Entries | ForEach-Object { $_.FullName }`,
    '$zip.Dispose()',
  ].join('; ');

  const { execSync } = require('child_process');
  return execSync(`powershell -NoProfile -Command "${command}"`, { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

const streamZipEntryLines = async (zipPath, entryName, onLine) => {
  const { execSync } = require('child_process');
  const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'eldermeds-rxnorm-'));
  try {
    const command = [
      'Add-Type -AssemblyName System.IO.Compression.FileSystem',
      `$zip=[IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/'/g, "''")}')`,
      `$entry=$zip.GetEntry('${entryName.replace(/'/g, "''")}')`,
      `$target='${path.join(tempDir, path.basename(entryName)).replace(/'/g, "''")}'`,
      '[IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)',
      '$zip.Dispose()',
    ].join('; ');

    execSync(`powershell -NoProfile -Command "${command}"`, { stdio: 'ignore' });
    const rl = readline.createInterface({
      input: fs.createReadStream(path.join(tempDir, path.basename(entryName)), { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      await onLine(line);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

const loadSiderDrugNames = async () => {
  const cidToNames = new Map();
  const nameToCid = new Map();

  const rl = readline.createInterface({
    input: fs.createReadStream(config.drugNamesPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const [cid, rawName] = line.split('\t');
    const name = normalizeDrugName(rawName);
    if (!cid || !name) {
      continue;
    }

    if (!cidToNames.has(cid)) {
      cidToNames.set(cid, new Set());
    }
    cidToNames.get(cid).add(name);
    if (!nameToCid.has(name)) {
      nameToCid.set(name, cid);
    }
  }

  return { cidToNames, nameToCid };
};

const loadSiderSideEffects = async () => {
  const cidToEffects = new Map();
  const stream = fs.createReadStream(config.sideEffectsPath).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const [flatCid, , , , , effectName] = line.split('\t');
    const cid = flatCid && flatCid.trim();
    const effect = normalizeText(effectName);
    if (!cid || !effect) {
      continue;
    }

    if (!cidToEffects.has(cid)) {
      cidToEffects.set(cid, new Map());
    }

    const effectCounts = cidToEffects.get(cid);
    effectCounts.set(effect, (effectCounts.get(effect) || 0) + 1);
  }

  return cidToEffects;
};

const pickTopEffects = (effectCounts, limit) =>
  Array.from(effectCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([name]) => name);

const loadDdinter = async () => {
  const files = fs
    .readdirSync(config.ddinterGlobRoot)
    .filter((file) => /^ddinter_downloads_code_.*\.csv$/i.test(file))
    .map((file) => path.join(config.ddinterGlobRoot, file));

  const interactions = [];
  const seen = new Set();
  const levelMap = {
    major: 'high',
    moderate: 'medium',
    minor: 'low',
  };

  for (const filePath of files) {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    let isFirst = true;
    for await (const line of rl) {
      if (isFirst) {
        isFirst = false;
        continue;
      }

      const parts = parseCsvLine(line);
      if (parts.length < 5) {
        continue;
      }
      const drugA = parts[1];
      const drugB = parts[3];
      const level = parts[4];
      const normalizedA = normalizeDrugName(drugA);
      const normalizedB = normalizeDrugName(drugB);
      const severity = levelMap[normalizeText(level)] || 'low';
      if (!normalizedA || !normalizedB) {
        continue;
      }

      const pairKey = [normalizedA, normalizedB].sort().join('::');
      if (seen.has(pairKey)) {
        continue;
      }
      seen.add(pairKey);

      interactions.push({
        drugA: normalizedA,
        drugB: normalizedB,
        severity,
        description: `${drugA} with ${drugB} is marked as ${severity} severity in DDInter.`,
      });
    }
  }

  return interactions;
};

const chooseBestRxnormEntry = (current, next) => {
  if (!current) {
    return next;
  }

  const currentPriority = rxnormTtyPriority[current.tty] || rxnormTtyPriority.OTH;
  const nextPriority = rxnormTtyPriority[next.tty] || rxnormTtyPriority.OTH;
  return nextPriority < currentPriority ? next : current;
};

const loadRxnorm = async () => {
  const entries = await parseZipEntries(config.rxnormZipPath);
  const targetEntry = entries.find((entry) => /RXNCONSO\.RRF$/i.test(entry));
  if (!targetEntry) {
    throw new Error('RXNCONSO.RRF not found in RxNorm zip');
  }

  const bestByName = new Map();
  const aliasesByCui = new Map();

  await streamZipEntryLines(config.rxnormZipPath, targetEntry, async (line) => {
    const parts = line.split('|');
    const rxcui = parts[0];
    const lat = parts[1];
    const sab = parts[11];
    const tty = parts[12];
    const rawName = parts[14];

    if (lat !== 'ENG' || sab !== 'RXNORM') {
      return;
    }

    const normalizedName = normalizeDrugName(rawName);
    if (!normalizedName) {
      return;
    }

    const candidate = {
      rxnormCui: rxcui,
      displayName: rawName.trim(),
      normalizedName,
      ingredientName: rawName.trim(),
      therapeuticClass: tty ? `RxNorm ${tty}` : '',
      tty,
    };

    bestByName.set(normalizedName, chooseBestRxnormEntry(bestByName.get(normalizedName), candidate));

    if (!aliasesByCui.has(rxcui)) {
      aliasesByCui.set(rxcui, new Set());
    }
    aliasesByCui.get(rxcui).add(rawName.trim());
  });

  const drugs = [];
  for (const [, entry] of bestByName) {
    const aliases = Array.from(aliasesByCui.get(entry.rxnormCui) || []);
    drugs.push({
      rxnormCui: entry.rxnormCui,
      displayName: entry.displayName,
      normalizedName: entry.normalizedName,
      ingredientName: entry.ingredientName,
      therapeuticClass: entry.therapeuticClass,
      aliases: aliases.slice(0, 25),
    });
  }

  return drugs;
};

const isSevereSideEffect = (effect) => severityKeywords.some((keyword) => effect.includes(keyword));

const buildKnowledge = async () => {
  const [rxnormDrugs, { nameToCid }, cidToEffects, interactions] = await Promise.all([
    loadRxnorm(),
    loadSiderDrugNames(),
    loadSiderSideEffects(),
    loadDdinter(),
  ]);

  const drugs = rxnormDrugs.map((drug) => {
    const candidateNames = [drug.normalizedName, ...drug.aliases.map(normalizeDrugName)];
    const matchedCid = candidateNames.map((name) => nameToCid.get(name)).find(Boolean);
    const effectCounts = matchedCid ? cidToEffects.get(matchedCid) : null;
    const allEffects = effectCounts ? pickTopEffects(effectCounts, 30) : [];

    return {
      ...drug,
      sideEffects: allEffects.filter((effect) => !isSevereSideEffect(effect)).slice(0, 15),
      severeSideEffects: allEffects.filter(isSevereSideEffect).slice(0, 10),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    sources: {
      rxnormZipPath: config.rxnormZipPath,
      drugNamesPath: config.drugNamesPath,
      sideEffectsPath: config.sideEffectsPath,
      ddinterRoot: config.ddinterGlobRoot,
    },
    summary: {
      drugCount: drugs.length,
      interactionCount: interactions.length,
    },
    drugs,
    interactions,
  };
};

const main = async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const knowledge = await buildKnowledge();
  fs.writeFileSync(outputPath, JSON.stringify(knowledge, null, 2));
  console.log(`[Knowledge] Drugs: ${knowledge.summary.drugCount}`);
  console.log(`[Knowledge] Interactions: ${knowledge.summary.interactionCount}`);
  console.log(`[Knowledge] Output -> ${outputPath}`);
};

main().catch((error) => {
  console.error('[Knowledge] Build failed:', error.message);
  process.exit(1);
});
