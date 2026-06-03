import type { SelectedDoc, ColumnDraft } from './types';

export function createTabularBuilder() {
  let docs = $state<SelectedDoc[]>([]);
  let columns = $state<ColumnDraft[]>([{ id: crypto.randomUUID(), name: '', query: '' }]);

  function validColumns(): { name: string; query: string }[] {
    return columns
      .map((c) => ({ name: c.name.trim(), query: c.query.trim() }))
      .filter((c) => c.name.length > 0 && c.query.length > 0);
  }

  return {
    get docs() {
      return docs;
    },
    get columns() {
      return columns;
    },
    get cellCount() {
      return docs.length * validColumns().length;
    },
    get canRun() {
      return docs.length > 0 && validColumns().length > 0;
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
    setColumn(id: string, patch: Partial<Pick<ColumnDraft, 'name' | 'query'>>) {
      columns = columns.map((c) => (c.id === id ? { ...c, ...patch } : c));
    },
    validColumns
  };
}
