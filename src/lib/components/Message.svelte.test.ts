/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import Message from './Message.svelte';

const h = vi.hoisted(() => ({ provenance: 'always' as 'always' | 'collapsed' }));
vi.mock('$app/state', () => ({
	page: {
		get data() {
			return { user: { provenance_pills: h.provenance } };
		}
	}
}));

describe('Message', () => {
	it('renders a user turn as a plain chip (no markdown block)', () => {
		const { container, getByText } = render(Message, {
			props: { message: { key: 'u1', id: 'u1', role: 'user', content: 'hello there' } }
		});
		expect(getByText('hello there')).toBeInTheDocument();
		expect(container.querySelector('.prose-mlq')).toBeNull();
	});

	it('renders an assistant turn as markdown prose with the tier chip', () => {
		const { container, getByText } = render(Message, {
			props: {
				message: {
					key: 'a1',
					id: 'a1',
					role: 'assistant',
					content: '**done**',
					routed_inference_tier: 3,
					status: 'done'
				}
			}
		});
		expect(container.querySelector('.prose-mlq')).not.toBeNull();
		expect(getByText(/Tier 3/)).toBeInTheDocument();
	});

	it('shows an error with a Retry button that calls onretry', async () => {
		let retried = false;
		const { getByRole } = render(Message, {
			props: {
				message: {
					key: 'a1',
					id: 'a1',
					role: 'assistant',
					content: '',
					status: 'error',
					error: 'gateway timeout'
				},
				onretry: () => (retried = true)
			}
		});
		getByRole('button', { name: /retry/i }).click();
		expect(retried).toBe(true);
	});

	it('shows an empty-response fallback with Retry when a done turn has no content', () => {
		let retried = false;
		const { getByRole, getByText } = render(Message, {
			props: {
				message: {
					key: 'e1',
					id: 'e1',
					role: 'assistant',
					content: '',
					status: 'done',
					routed_inference_tier: 1
				},
				onretry: () => (retried = true)
			}
		});
		expect(getByText(/empty response/i)).toBeInTheDocument();
		getByRole('button', { name: /retry/i }).click();
		expect(retried).toBe(true);
	});

	it('renders citation pills for a done assistant message with citations', () => {
		const { container } = render(Message, {
			props: {
				message: {
					key: 'a2',
					id: 'a2',
					role: 'assistant',
					status: 'done',
					content: 'Terminate on "thirty days" (Source: [1]).',
					citations: [
						{
							id: 'c1',
							source_file_id: 'f1',
							source_text: 'thirty days',
							partial: false,
							verified: true,
							verification_method: 'exact_match'
						}
					]
				}
			}
		});
		expect(container.querySelector('.cite-tab.cite-verified')).not.toBeNull();
	});

	it('shows the Anonymized badge when message.anonymized is true', () => {
		const { getByText } = render(Message, {
			props: {
				message: {
					key: 'a3',
					id: 'a3',
					role: 'assistant',
					status: 'done',
					content: 'ok',
					routed_inference_tier: 4,
					anonymized: true
				}
			}
		});
		expect(getByText(/Anonymized/i)).toBeInTheDocument();
	});
	it('does not show the badge when anonymized is false/undefined', () => {
		const { queryByText } = render(Message, {
			props: {
				message: {
					key: 'a4',
					id: 'a4',
					role: 'assistant',
					status: 'done',
					content: 'ok',
					routed_inference_tier: 4,
					anonymized: false
				}
			}
		});
		expect(queryByText(/Anonymized/i)).toBeNull();
	});

	it('shows the applied-skills footer with prettified, linked names', () => {
		const { getByText, getByRole } = render(Message, {
			props: {
				message: {
					key: 'a7',
					id: 'a7',
					role: 'assistant',
					status: 'done',
					content: 'ok',
					routed_inference_tier: 4,
					applied_skills: ['comms-improver', 'nda-review']
				}
			}
		});
		expect(getByText(/Applied:/)).toBeInTheDocument();
		const link = getByRole('link', { name: 'Comms Improver' });
		expect(link).toHaveAttribute('href', '/skills');
		expect(getByRole('link', { name: 'NDA Review' })).toHaveAttribute('href', '/skills');
	});

	it('renders no applied-skills footer when none were applied', () => {
		const { queryByText } = render(Message, {
			props: {
				message: {
					key: 'a8',
					id: 'a8',
					role: 'assistant',
					status: 'done',
					content: 'ok',
					routed_inference_tier: 4
				}
			}
		});
		expect(queryByText(/Applied:/)).toBeNull();
	});

	it('shows a file-count indicator (plural) when applied_file_ids are present', () => {
		const { getByText } = render(Message, {
			props: {
				message: {
					key: 'af1',
					id: 'af1',
					role: 'assistant',
					status: 'done',
					content: 'ok',
					routed_inference_tier: 4,
					applied_file_ids: ['x', 'y']
				}
			}
		});
		expect(getByText('2 files')).toBeInTheDocument();
	});

	it('uses the singular for one attached file', () => {
		const { getByText } = render(Message, {
			props: {
				message: {
					key: 'af2',
					id: 'af2',
					role: 'assistant',
					status: 'done',
					content: 'ok',
					routed_inference_tier: 4,
					applied_file_ids: ['x']
				}
			}
		});
		expect(getByText('1 file')).toBeInTheDocument();
	});

	it('renders no file indicator when none were applied', () => {
		const { queryByText } = render(Message, {
			props: {
				message: {
					key: 'af3',
					id: 'af3',
					role: 'assistant',
					status: 'done',
					content: 'ok',
					routed_inference_tier: 4
				}
			}
		});
		expect(queryByText(/\bfiles?\b/)).toBeNull();
	});
});

const doneMsg = {
	key: 'a9',
	id: 'a9',
	role: 'assistant',
	content: 'Answer.',
	status: 'done',
	routed_inference_tier: 4,
	anonymized: true,
	applied_skills: ['summarize'],
	citations: []
} as unknown as import('$lib/chat/chatStream.svelte').ChatMessage;

describe('Message provenance pills (provenance_pills preference)', () => {
	it('shows Tier + Anonymized + Applied and no Details toggle when always', () => {
		h.provenance = 'always';
		render(Message, { props: { message: doneMsg } });
		expect(screen.getByText(/Tier 4/)).toBeInTheDocument();
		expect(screen.getByText(/Anonymized/)).toBeInTheDocument();
		expect(screen.getByText(/Applied:/)).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /details/i })).toBeNull();
	});

	it('hides the pills behind a Details toggle when collapsed, revealing them on click', async () => {
		h.provenance = 'collapsed';
		render(Message, { props: { message: doneMsg } });
		expect(screen.queryByText(/Tier 4/)).toBeNull();
		expect(screen.queryByText(/Anonymized/)).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /details/i }));
		expect(screen.getByText(/Tier 4/)).toBeInTheDocument();
		expect(screen.getByText(/Anonymized/)).toBeInTheDocument();
		expect(screen.getByText(/Applied:/)).toBeInTheDocument();
	});
});

describe('Message tool-loop cards', () => {
	it('renders the confirmation card and fires ondecide', async () => {
		let decided: string | null = null;
		const { getByRole, getByText } = render(Message, {
			props: {
				message: {
					key: 'g1',
					id: 'g1',
					role: 'assistant',
					content: '',
					status: 'awaiting_confirmation',
					confirmation: {
						pending_call_id: 'p1',
						provider: 'deepwiki',
						tool: 'read_wiki_structure',
						function_name: 'mcp__deepwiki__read_wiki_structure',
						args_summary: { repoName: 'facebook/react' },
						tier: 2,
						destructive: true
					}
				} as never,
				ondecide: (d: 'approve' | 'deny') => (decided = d)
			}
		});
		expect(getByText(/read_wiki_structure/)).toBeInTheDocument();
		expect(getByText(/facebook\/react/)).toBeInTheDocument();
		expect(getByText(/destructive/i)).toBeInTheDocument();
		getByRole('button', { name: /approve/i }).click();
		expect(decided).toBe('approve');
	});

	it('renders the connect card linking to the BFF connect route with a chat return', () => {
		const { getByRole } = render(Message, {
			props: {
				message: {
					key: 'g2',
					id: 'g2',
					role: 'assistant',
					content: '',
					status: 'awaiting_auth',
					mcpAuth: { server: 'context7', authorize_url: '/api/v1/mcp/oauth/context7/authorize' }
				} as never,
				chatId: 'c1'
			}
		});
		const link = getByRole('link', { name: /connect/i });
		expect(link).toHaveAttribute(
			'href',
			'/settings/connections/context7/connect?return=' + encodeURIComponent('/chats/c1')
		);
	});

	it('does not render the connect card without a chatId', () => {
		const { queryByRole } = render(Message, {
			props: {
				message: {
					key: 'g3',
					id: 'g3',
					role: 'assistant',
					content: '',
					status: 'awaiting_auth',
					mcpAuth: { server: 'context7', authorize_url: '/api/v1/mcp/oauth/context7/authorize' }
				} as never
			}
		});
		expect(queryByRole('link', { name: /connect/i })).toBeNull();
	});
});

describe('Message fiduciary receipt (trust pill + expandable panel)', () => {
	const ledgerGate = {
		message_id: 'f1',
		gate_status: 'flagged',
		pass_count: 0,
		supported_count: 0,
		fail_count: 1,
		total_assertions: 1,
		confidence: null,
		created_at: null
	};
	const ledgerEntries = [
		{
			id: 'le1',
			message_id: 'f1',
			source_kind: 'kb_document',
			verification_status: 'unverified',
			confidence: null,
			provider: null,
			retrieved_at: null,
			treatment_id: null,
			created_at: null,
			source: {
				kind: 'kb_document',
				source_file_id: 'sf1',
				opinion_id: null,
				cluster_id: null,
				external_ref: null,
				provider: null,
				label: 'Master Services Agreement',
				subtitle: null,
				url: null,
				tool: null,
				passages: [
					{
						text: 'termination requires thirty days notice',
						offset_start: null,
						offset_end: null,
						page: null,
						verified: null,
						method: null
					}
				]
			}
		}
	];

	it('always shows the trust pill for a done message with a ledger gate, independent of provenance_pills', () => {
		h.provenance = 'collapsed';
		render(Message, {
			props: {
				message: {
					key: 'f1',
					id: 'f1',
					role: 'assistant',
					content: 'Answer.',
					status: 'done',
					ledgerGate,
					ledgerEntries
				} as never
			}
		});
		expect(screen.getByRole('button', { name: /needs review/i })).toBeInTheDocument();
	});

	it('reveals the receipt panel with the quoted passage when the pill is clicked', async () => {
		h.provenance = 'always';
		render(Message, {
			props: {
				message: {
					key: 'f2',
					id: 'f2',
					role: 'assistant',
					content: 'Answer.',
					status: 'done',
					ledgerGate,
					ledgerEntries
				} as never
			}
		});
		expect(screen.queryByText(/thirty days notice/)).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /needs review/i }));
		expect(screen.getByText(/thirty days notice/)).toBeInTheDocument();
	});

	it('starts the treatment poll (fetches the ledger) once the panel is opened on a caselaw entry with pending treatment', async () => {
		h.provenance = 'always';
		const fetchSpy = vi
			.spyOn(global, 'fetch')
			.mockResolvedValue({ ok: true, json: async () => ({ entries: [], gates: [] }) } as Response);
		const caselawEntries = [
			{
				id: 'le2',
				message_id: 'f3',
				source_kind: 'caselaw',
				verification_status: 'unverified',
				confidence: null,
				provider: null,
				retrieved_at: null,
				treatment_id: null,
				treatment: null,
				created_at: null,
				source: {
					kind: 'caselaw',
					source_file_id: null,
					opinion_id: 42,
					cluster_id: null,
					external_ref: null,
					provider: null,
					label: 'Roe v. Wade',
					subtitle: null,
					url: null,
					tool: 'search_case_law',
					passages: []
				}
			}
		];
		render(Message, {
			props: {
				message: {
					key: 'f3',
					id: 'f3',
					role: 'assistant',
					content: 'Answer.',
					status: 'done',
					ledgerGate,
					ledgerEntries: caselawEntries
				} as never,
				chatId: 'c1'
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: /needs review/i }));
		await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/chats/c1/ledger?message_id=f3'));
		fetchSpy.mockRestore();
	});

	it('wires onopensource so clicking a source title in the open panel fires the handler', async () => {
		h.provenance = 'always';
		const onopensource = vi.fn();
		render(Message, {
			props: {
				message: {
					key: 'f4',
					id: 'f4',
					role: 'assistant',
					content: 'Answer.',
					status: 'done',
					ledgerGate,
					ledgerEntries
				} as never,
				onopensource
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: /needs review/i }));
		await fireEvent.click(screen.getByRole('button', { name: /master services agreement/i }));
		expect(onopensource).toHaveBeenCalledWith(ledgerEntries[0]);
	});
});
