import { describe, expect, it } from 'vitest';
import { checkDrugInteractions } from '../src/utils/drugInteractions';

describe('checkDrugInteractions', () => {
  it('finds class-based interactions using brand or generic names', () => {
    expect(checkDrugInteractions(['Xanax 0.5mg', 'Oxycodone 5mg']).severity).toBe('CRITICAL');
    expect(checkDrugInteractions(['Isosorbide mononitrate', 'Cialis']).severity).toBe('CRITICAL');
    expect(checkDrugInteractions(['Simvastatin 40mg', 'Clarithromycin']).severity).toBe('MODERATE');
  });

  it('reports every interaction, most severe first', () => {
    const r = checkDrugInteractions(['Lisinopril', 'Spironolactone', 'Warfarin', 'Ibuprofen']);
    expect(r.matches).toHaveLength(2);
    expect(r.matches[0].severity).toBe('CRITICAL');
    expect(r.description).toContain('+1 more');
  });

  it('does not flag a drug against itself or unrelated drugs', () => {
    expect(checkDrugInteractions(['Lisinopril 20mg']).severity).toBe('NONE');
    expect(checkDrugInteractions(['Paracetamol', 'Amoxicillin']).severity).toBe('NONE');
  });
});
