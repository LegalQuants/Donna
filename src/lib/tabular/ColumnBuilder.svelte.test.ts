import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ColumnBuilder from './ColumnBuilder.svelte';
import { createTabularBuilder } from './tabularBuilder.svelte';

describe('ColumnBuilder', () => {
  it('renders a name + query input per column and an Add column control', () => {
    const b = createTabularBuilder();
    render(ColumnBuilder, { props: { builder: b } as never });
    expect(screen.getByPlaceholderText('Column name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/what should we extract/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add column/i })).toBeInTheDocument();
  });

  it('typing updates the builder column and Add column appends a row', async () => {
    const b = createTabularBuilder();
    render(ColumnBuilder, { props: { builder: b } as never });
    await fireEvent.input(screen.getByPlaceholderText('Column name'), { target: { value: 'Term' } });
    expect(b.columns[0].name).toBe('Term');
    await fireEvent.click(screen.getByRole('button', { name: /add column/i }));
    expect(b.columns.length).toBe(2);
  });

  it('shows a remove control once there is more than one column', async () => {
    const b = createTabularBuilder();
    b.addColumn();
    render(ColumnBuilder, { props: { builder: b } as never });
    const removes = screen.getAllByRole('button', { name: /remove column/i });
    expect(removes.length).toBe(2);
    await fireEvent.click(removes[0]);
    expect(b.columns.length).toBe(1);
  });
});
