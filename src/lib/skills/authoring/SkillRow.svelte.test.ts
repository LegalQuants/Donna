/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SkillRow from './SkillRow.svelte';
import type { UserSkill } from './types';

const skill: UserSkill = {
  id: 's1', scope: 'user', slug: 'nda', display_name: 'NDA Review', description: 'Reviews NDAs',
  version: '1.0.0', tags: ['nda'], body: 'b', slash_alias: '/nda',
  archived_at: null, created_at: '', updated_at: ''
} as UserSkill;

describe('SkillRow', () => {
  it('links to the skill detail page and shows the display name', () => {
    render(SkillRow, { props: { skill } });
    const link = screen.getByRole('link', { name: /NDA Review/ });
    expect(link).toHaveAttribute('href', '/skills/s1');
  });

  it('shows the slash alias when present', () => {
    render(SkillRow, { props: { skill } });
    expect(screen.getByText('/nda')).toBeInTheDocument();
  });
});
