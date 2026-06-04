import type { SelectedDoc, ColumnDraft, ColumnSpec, TableSkillSummary } from './types';

type BuildRequest = { document_ids: string[] } & (
  | { columns: ColumnSpec[] }
  | { skill_name: string }
);

export function createTabularBuilder() {
  let docs = $state<SelectedDoc[]>([]);
  let columns = $state<ColumnDraft[]>([{ id: crypto.randomUUID(), name: '', query: '' }]);
  let mode = $state<'adhoc' | 'skill'>('adhoc');
  let selectedSkill = $state<TableSkillSummary | null>(null);

  function validColumns(): ColumnSpec[] {
    return columns
      .map((c) => {
        const base: ColumnSpec = { name: c.name.trim(), query: c.query.trim() };
        if (c.minimum_inference_tier != null) base.minimum_inference_tier = c.minimum_inference_tier;
        if (c.ensemble_verification === true) base.ensemble_verification = true;
        return base;
      })
      .filter((c) => c.name.length > 0 && c.query.length > 0);
  }

  function hasDuplicateNames(): boolean {
    const names = validColumns().map((c) => c.name.toLowerCase());
    return new Set(names).size !== names.length;
  }

  return {
    get docs() {
      return docs;
    },
    get columns() {
      return columns;
    },
    get mode() {
      return mode;
    },
    get selectedSkill() {
      return selectedSkill;
    },
    get cellCount() {
      return docs.length * validColumns().length;
    },
    get canRun() {
      if (docs.length === 0) return false;
      return mode === 'skill'
        ? selectedSkill !== null
        : validColumns().length > 0 && !hasDuplicateNames();
    },
    get duplicateNames() {
      return hasDuplicateNames();
    },
    setMode(m: 'adhoc' | 'skill') {
      mode = m;
    },
    selectSkill(s: TableSkillSummary) {
      selectedSkill = s;
    },
    clearSkill() {
      selectedSkill = null;
    },
    hasDoc(documentId: string) {
      return docs.some((d) => d.document_id === documentId);
    },
    addDoc(doc: SelectedDoc) {
      if (!docs.some((d) => d.document_id === doc.document_id)) docs = [...docs, doc];
    },
    removeDoc(documentId: string) {
      docs = docs.filter((d) => d.document_id !== documentId);
    },
    addColumn() {
      columns = [...columns, { id: crypto.randomUUID(), name: '', query: '' }];
    },
    removeColumn(id: string) {
      if (columns.length <= 1) return; // keep at least one row
      columns = columns.filter((c) => c.id !== id);
    },
    moveColumn(id: string, dir: -1 | 1) {
      const i = columns.findIndex((c) => c.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= columns.length) return;
      const next = [...columns];
      [next[i], next[j]] = [next[j], next[i]];
      columns = next;
    },
    setColumn(id: string, patch: Partial<Pick<ColumnDraft, 'name' | 'query' | 'minimum_inference_tier' | 'ensemble_verification'>>) {
      columns = columns.map((c) => (c.id === id ? { ...c, ...patch } : c));
    },
    validColumns,
    buildRequest(): BuildRequest {
      const document_ids = docs.map((d) => d.document_id);
      return mode === 'skill' && selectedSkill
        ? { document_ids, skill_name: selectedSkill.name }
        : { document_ids, columns: validColumns() };
    }
  };
}
