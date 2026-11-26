// Drug-drug interaction screening.
//
// IMPORTANT: this is a small, hand-curated reference list for demonstration and
// education. It is NOT a complete clinical decision-support database and must
// not be relied on for real prescribing. A production system should use a
// licensed, maintained interaction knowledge base.

export type InteractionSeverity = 'CRITICAL' | 'MODERATE' | 'NONE';

export interface InteractionResult {
  severity: InteractionSeverity;
  description: string;
  resolution: string;
  /** Every individual interaction found, most severe first. */
  matches: { drugs: [string, string]; severity: Exclude<InteractionSeverity, 'NONE'>; description: string; resolution: string }[];
}

/** Drug classes -> member names (generic + common brand names), all lower case. */
const CLASSES: Record<string, string[]> = {
  opioid: ['opioid', 'oxycodone', 'hydrocodone', 'morphine', 'fentanyl', 'methadone', 'codeine', 'tramadol', 'tapentadol', 'buprenorphine', 'hydromorphone', 'oxycontin', 'percocet', 'vicodin'],
  benzodiazepine: ['benzodiazepine', 'diazepam', 'alprazolam', 'lorazepam', 'clonazepam', 'midazolam', 'temazepam', 'chlordiazepoxide', 'valium', 'xanax', 'ativan', 'klonopin'],
  alcohol: ['alcohol', 'ethanol'],
  nitrate: ['nitroglycerin', 'nitroglycerine', 'isosorbide', 'glyceryl trinitrate', 'amyl nitrite'],
  pde5: ['sildenafil', 'tadalafil', 'vardenafil', 'avanafil', 'viagra', 'cialis'],
  anticoagulant: ['warfarin', 'coumadin', 'apixaban', 'rivaroxaban', 'dabigatran', 'edoxaban', 'eliquis', 'xarelto'],
  nsaid: ['aspirin', 'ibuprofen', 'naproxen', 'diclofenac', 'celecoxib', 'ketorolac', 'indomethacin', 'meloxicam'],
  acei_arb: ['lisinopril', 'enalapril', 'ramipril', 'captopril', 'perindopril', 'losartan', 'valsartan', 'irbesartan', 'candesartan', 'telmisartan'],
  k_sparing: ['spironolactone', 'eplerenone', 'amiloride', 'triamterene', 'potassium chloride'],
  metformin: ['metformin', 'glucophage'],
  contrast: ['contrast dye', 'iodinated contrast', 'iohexol', 'iopamidol'],
  statin_3a4: ['simvastatin', 'lovastatin'],
  strong_3a4_inhibitor: ['amiodarone', 'clarithromycin', 'erythromycin', 'ketoconazole', 'itraconazole', 'ritonavir', 'diltiazem', 'verapamil'],
  digoxin: ['digoxin', 'lanoxin'],
  loop_thiazide: ['furosemide', 'bumetanide', 'torsemide', 'hydrochlorothiazide', 'chlorthalidone'],
  ssri_snri: ['fluoxetine', 'sertraline', 'paroxetine', 'citalopram', 'escitalopram', 'venlafaxine', 'duloxetine'],
  maoi: ['phenelzine', 'tranylcypromine', 'selegiline', 'isocarboxazid', 'linezolid'],
  triptan: ['sumatriptan', 'rizatriptan', 'zolmitriptan'],
  methotrexate: ['methotrexate'],
  trimethoprim: ['trimethoprim', 'co-trimoxazole', 'bactrim', 'sulfamethoxazole'],
  qt_prolonging: ['ondansetron', 'haloperidol', 'azithromycin', 'citalopram', 'methadone', 'sotalol'],
  lithium: ['lithium'],
  clopidogrel: ['clopidogrel', 'plavix'],
  ppi_2c19: ['omeprazole', 'esomeprazole'],
};

interface Rule {
  a: string;
  b: string;
  severity: 'CRITICAL' | 'MODERATE';
  description: string;
  resolution: string;
}

const RULES: Rule[] = [
  { a: 'opioid', b: 'benzodiazepine', severity: 'CRITICAL', description: 'Opioids with benzodiazepines cause additive CNS and respiratory depression, with a high risk of fatal overdose.', resolution: 'Avoid co-prescribing. If unavoidable, use the lowest doses for the shortest time, monitor closely and consider naloxone.' },
  { a: 'alcohol', b: 'benzodiazepine', severity: 'CRITICAL', description: 'Alcohol with benzodiazepines causes additive CNS and respiratory depression.', resolution: 'Counsel the patient to avoid alcohol completely during therapy.' },
  { a: 'alcohol', b: 'opioid', severity: 'CRITICAL', description: 'Alcohol with opioids causes additive CNS and respiratory depression.', resolution: 'Counsel the patient to avoid alcohol completely during therapy.' },
  { a: 'nitrate', b: 'pde5', severity: 'CRITICAL', description: 'Nitrates with PDE-5 inhibitors can cause severe, life-threatening hypotension.', resolution: 'Contraindicated. Do not give a PDE-5 inhibitor within 24–48 hours of a nitrate.' },
  { a: 'anticoagulant', b: 'nsaid', severity: 'CRITICAL', description: 'Anticoagulants with NSAIDs/aspirin markedly increase the risk of serious bleeding, including GI and intracranial haemorrhage.', resolution: 'Avoid unless specifically indicated; prefer paracetamol for pain, add gastroprotection and monitor (INR for warfarin).' },
  { a: 'maoi', b: 'ssri_snri', severity: 'CRITICAL', description: 'MAO inhibitors with SSRIs/SNRIs can cause serotonin syndrome, which may be fatal.', resolution: 'Contraindicated. Observe the required washout period (typically 2–5 weeks) when switching.' },
  { a: 'methotrexate', b: 'trimethoprim', severity: 'CRITICAL', description: 'Trimethoprim increases methotrexate toxicity (bone-marrow suppression).', resolution: 'Avoid the combination; choose an alternative antibiotic.' },
  { a: 'acei_arb', b: 'k_sparing', severity: 'MODERATE', description: 'ACE inhibitors/ARBs with potassium-sparing agents raise the risk of hyperkalaemia.', resolution: 'Check potassium and renal function within about a week of starting, then regularly.' },
  { a: 'metformin', b: 'contrast', severity: 'MODERATE', description: 'Iodinated contrast can cause acute kidney injury, leading to metformin accumulation and lactic acidosis.', resolution: 'Follow local guidance: usually withhold metformin for 48 hours after contrast and restart once renal function is confirmed stable.' },
  { a: 'statin_3a4', b: 'strong_3a4_inhibitor', severity: 'MODERATE', description: 'CYP3A4 inhibitors raise simvastatin/lovastatin levels, increasing the risk of myopathy and rhabdomyolysis.', resolution: 'Limit the statin dose (e.g. simvastatin ≤20 mg with amiodarone) or switch to a statin less affected by CYP3A4.' },
  { a: 'digoxin', b: 'loop_thiazide', severity: 'MODERATE', description: 'Diuretic-induced hypokalaemia increases the risk of digoxin toxicity and arrhythmias.', resolution: 'Monitor potassium (keep it above about 4.0 mmol/L) and digoxin levels.' },
  { a: 'digoxin', b: 'strong_3a4_inhibitor', severity: 'MODERATE', description: 'Amiodarone, verapamil and some macrolides raise digoxin levels.', resolution: 'Reduce the digoxin dose (often by about half) and monitor levels.' },
  { a: 'triptan', b: 'ssri_snri', severity: 'MODERATE', description: 'Triptans with SSRIs/SNRIs carry a risk of serotonin syndrome.', resolution: 'Use with caution and warn the patient about the symptoms.' },
  { a: 'qt_prolonging', b: 'qt_prolonging', severity: 'MODERATE', description: 'More than one QT-prolonging drug increases the risk of torsades de pointes.', resolution: 'Check a baseline ECG and electrolytes; avoid the combination where possible.' },
  { a: 'lithium', b: 'acei_arb', severity: 'MODERATE', description: 'ACE inhibitors/ARBs reduce lithium clearance and can cause lithium toxicity.', resolution: 'Monitor lithium levels closely after starting or changing the dose.' },
  { a: 'lithium', b: 'nsaid', severity: 'MODERATE', description: 'NSAIDs reduce lithium clearance and can cause lithium toxicity.', resolution: 'Avoid regular NSAIDs, or monitor lithium levels closely.' },
  { a: 'clopidogrel', b: 'ppi_2c19', severity: 'MODERATE', description: 'Omeprazole/esomeprazole inhibit CYP2C19 and reduce clopidogrel activation.', resolution: 'Prefer pantoprazole if a PPI is needed.' },
];

function classesOf(drug: string): string[] {
  const d = drug.toLowerCase();
  return Object.entries(CLASSES)
    .filter(([, members]) => members.some(m => d.includes(m)))
    .map(([cls]) => cls);
}

const NO_INTERACTION: Omit<InteractionResult, 'matches'> = {
  severity: 'NONE',
  description: 'No interactions found in the MedSafe reference list. This list is limited; always confirm with a full interaction database.',
  resolution: 'Continue routine monitoring.',
};

export function checkDrugInteractions(medicines: string[]): InteractionResult {
  const drugs = medicines.map(m => m.trim()).filter(Boolean);
  const matches: InteractionResult['matches'] = [];
  const seen = new Set<string>();

  for (let i = 0; i < drugs.length; i++) {
    for (let j = i + 1; j < drugs.length; j++) {
      const ci = classesOf(drugs[i]);
      const cj = classesOf(drugs[j]);
      for (const rule of RULES) {
        const hit = (ci.includes(rule.a) && cj.includes(rule.b)) || (ci.includes(rule.b) && cj.includes(rule.a));
        const key = `${i}|${j}|${rule.a}|${rule.b}`;
        if (hit && !seen.has(key)) {
          seen.add(key);
          matches.push({ drugs: [drugs[i], drugs[j]], severity: rule.severity, description: rule.description, resolution: rule.resolution });
        }
      }
    }
  }

  matches.sort((x, y) => (x.severity === y.severity ? 0 : x.severity === 'CRITICAL' ? -1 : 1));

  if (matches.length === 0) return { ...NO_INTERACTION, matches };

  const top = matches[0];
  const extra = matches.length > 1 ? ` (+${matches.length - 1} more interaction${matches.length > 2 ? 's' : ''} found)` : '';
  return {
    severity: top.severity,
    description: `${top.drugs[0]} + ${top.drugs[1]}: ${top.description}${extra}`,
    resolution: top.resolution,
    matches,
  };
}
