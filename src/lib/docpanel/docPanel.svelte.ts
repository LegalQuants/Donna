import type { Citation } from '$lib/citations/types';
import type { DocTab } from './types';
import { clearHighlight } from './pdfHighlight';

const WIDTH_KEY = 'donna.docpanel.width';
const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 320;
const MAX_WIDTH = 900;

function readWidth(): number {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY));
    if (!Number.isFinite(v) || v <= 0) return DEFAULT_WIDTH;
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(v)));
  } catch {
    return DEFAULT_WIDTH;
  }
}

export function createDocPanel() {
  let open_ = $state(false);
  let tabs = $state<DocTab[]>([]);
  let activeId = $state<string | null>(null);
  let width = $state(readWidth());

  const activeTab = $derived(tabs.find((t) => t.fileId === activeId) ?? null);

  async function open(c: Citation, fetchFn: typeof fetch = fetch) {
    const fileId = c.source_file_id;
    const page = c.source_page ?? null;
    const quote = c.source_text ?? '';
    open_ = true;

    const existing = tabs.find((t) => t.fileId === fileId);
    if (existing) {
      existing.page = page;
      existing.quote = quote;
      existing.cite = c;
      existing.highlightStatus = 'pending';
      activeId = fileId;
      return;
    }

    tabs = [...tabs, { fileId, filename: '', mime: '', status: 'loading', page, quote, cite: c, highlightStatus: 'pending' }];
    activeId = fileId;

    try {
      const res = await fetchFn(`/files/${fileId}`);
      if (!res.ok) throw new Error(String(res.status));
      const meta = (await res.json()) as { filename?: string; mime_type?: string };
      const entry = tabs.find((t) => t.fileId === fileId);
      if (entry) {
        entry.filename = meta.filename ?? '';
        entry.mime = meta.mime_type ?? '';
        entry.status = 'ready';
      }
    } catch {
      const entry = tabs.find((t) => t.fileId === fileId);
      if (entry) entry.status = 'error';
    }
  }

  function setActive(id: string) {
    if (tabs.some((t) => t.fileId === id)) activeId = id;
  }

  function setHighlightStatus(fileId: string, status: 'found' | 'miss') {
    const t = tabs.find((t) => t.fileId === fileId);
    if (t) t.highlightStatus = status;
  }

  function close(id: string) {
    tabs = tabs.filter((t) => t.fileId !== id);
    if (activeId === id) activeId = tabs.at(-1)?.fileId ?? null;
    if (tabs.length === 0) open_ = false;
  }

  function closePanel() {
    open_ = false;
    clearHighlight();
  }

  function setWidth(px: number) {
    width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(px)));
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      /* storage unavailable — keep in-memory width */
    }
  }

  return {
    get open_() { return open_; },
    get tabs() { return tabs; },
    get activeId() { return activeId; },
    get activeTab() { return activeTab; },
    get width() { return width; },
    open,
    setActive,
    close,
    closePanel,
    setWidth,
    setHighlightStatus
  };
}

export type DocPanel = ReturnType<typeof createDocPanel>;
