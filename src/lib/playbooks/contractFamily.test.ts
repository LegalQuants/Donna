import { describe, it, expect } from 'vitest';
import { groupByContractFamily } from './contractFamily';
import type { Playbook } from './types';

const pb = (id: string, contract_type: string, name = id): Playbook =>
  ({ id, name, contract_type, version: '1.0.0', created_at: '', updated_at: '' }) as Playbook;

describe('groupByContractFamily', () => {
  it('groups by the segment before the first dash', () => {
    const out = groupByContractFamily([
      pb('1', 'NDA'),
      pb('2', 'NDA-unilateral'),
      pb('3', 'MSA-SaaS'),
      pb('4', 'DPA-GDPR')
    ]);
    expect(out.map((g) => g.family)).toEqual(['NDA', 'MSA', 'DPA']);
    expect(out[0].playbooks.map((p) => p.id)).toEqual(['1', '2']);
  });
  it('keeps first-seen family order and input order within a family', () => {
    const out = groupByContractFamily([pb('1', 'MSA-SaaS'), pb('2', 'NDA'), pb('3', 'MSA-Commercial')]);
    expect(out.map((g) => g.family)).toEqual(['MSA', 'NDA']);
    expect(out[0].playbooks.map((p) => p.id)).toEqual(['1', '3']);
  });
  it('treats a dash-less contract_type as its own family', () => {
    expect(groupByContractFamily([pb('1', 'NDA')])[0].family).toBe('NDA');
  });
  it('returns an empty array for no playbooks', () => {
    expect(groupByContractFamily([])).toEqual([]);
  });
});
