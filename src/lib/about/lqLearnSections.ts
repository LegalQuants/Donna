export type LqLearnSection = {
	number: number;
	title: string; // WITHOUT the leading number
	paragraphs: string[]; // framing prose, ported verbatim (LQ.AI → LQ-AI)
	playground: string; // filename stem under /learn/playgrounds/<playground>.html
	sourceLabel: string; // visible link text, e.g. "docs/architecture.md"
	sourceUrl: string; // GitHub blob URL
};

export const lqLearnSections: LqLearnSection[] = [
	{
		number: 1,
		title: 'The big picture: System Architecture',
		paragraphs: [
			'LQ-AI is three services: the FastAPI backend (api/), the Inference Gateway (gateway/), and the SvelteKit web frontend (web/). They communicate over HTTP using OpenAPI-defined contracts; no service shares in-process code with another. The Gateway is the security boundary — the only component that holds provider API keys and makes outbound inference calls. This map shows the service topology, the network boundaries, and the trust model.'
		],
		playground: 'system-architecture',
		sourceLabel: 'docs/architecture.md',
		sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/docs/architecture.md'
	},
	{
		number: 2,
		title: 'A request, end to end: Lifecycle of a chat send',
		paragraphs: [
			'When you press Enter in the composer, the message travels through at least six distinct processing stages before the model sees it — and through three more before the response reaches your screen. Each stage can add context (skill prompt, KB chunks, tier metadata), apply a policy check, or produce an audit record. This playground walks the full path so you can see where each transformation happens and which file implements it.'
		],
		playground: 'request-lifecycle',
		sourceLabel: 'api/app/api/chats.py',
		sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/api/app/api/chats.py'
	},
	{
		number: 3,
		title: 'The tier system: when the Gateway says no',
		paragraphs: [
			'The Gateway enforces five data-sensitivity tiers (Tier 1 = local / air-gapped, most secure; Tier 5 = consumer, least secure). When a request arrives, the Gateway compares the requested provider\'s tier against the matter\'s configured floor. A floor of Tier N means "require Tier N or stronger" — if the provider\'s tier is weaker (higher-numbered) than the floor, the request is refused with a structured error, not a generic 500. This playground lets you set a matter context and a model alias and see whether the request would pass or be refused — the same logic the Gateway runs at gateway/app/tier_floor.py.'
		],
		playground: 'tier-system',
		sourceLabel: 'gateway/app/tier_floor.py',
		sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/gateway/app/tier_floor.py'
	},
	{
		number: 4,
		title: 'What the model actually sees: Skill Composition',
		paragraphs: [
			"When a skill is invoked, the final prompt the model receives is an assembly of layers: the skill's system prompt, any input variables resolved against the user's message, reference file content, KB chunks retrieved for this specific message, and the conversation history. This playground lets you toggle each layer on or off and watch the assembled context update in real time. The assembly logic lives at api/app/pipeline/."
		],
		playground: 'skill-composition',
		sourceLabel: 'api/app/pipeline/',
		sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/api/app/pipeline/'
	},
	{
		number: 5,
		title: 'Verifying what the model said: Citation Engine cascade',
		paragraphs: [
			'Every "<quote>" (Source: [N]) the model emits runs through a four-stage verification cascade: exact match → tolerant match → paraphrase judge → optional ensemble. The first stage to verify wins; failures cascade. A citation that misses every stage is not persisted — its absence is the "unverified" signal the M2-C2 UI consumes. This playground lets you pick or craft a (source, quote) pair and watch which stage verifies, what the persisted verification_method would be, and how the chat surface would render it.'
		],
		playground: 'citation-engine-cascade',
		sourceLabel: 'api/app/citation/verification.py',
		sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/api/app/citation/verification.py'
	},
	{
		number: 6,
		title: 'Confidentiality: Anonymization Layer pre/post',
		paragraphs: [
			"The gateway's Anonymization Layer (M2-B3) is pre/post middleware that pseudonymizes detected entities (PERSON, ORGANIZATION, EMAIL_ADDRESS, PHONE_NUMBER, LOCATION, US_BANK_NUMBER + custom CASE_NUMBER and MATTER_NUMBER) before requests leave for the model provider, and rehydrates the pseudonyms on the response. The per-request PseudonymMapper lives in process memory only — never persisted, never logged, dropped on function exit. Privileged-project chats skip the layer entirely; retrieval-context system messages skip via lq_ai_skip_anonymization so source quotes reach the model intact for citation grounding. This playground walks the full pipeline with toggles for both skip behaviors.",
			'Honest validation posture: the custom recognizers and middleware integration are tested; Presidio default-recognizer recall/precision on legal-document corpus specifically is empirically unmeasured — docs/security/anonymization.md §"What\'s validated vs unvalidated" for the risk framing and route-to-Tier-1 guidance.'
		],
		playground: 'anonymization-layer',
		sourceLabel: 'gateway/app/anonymization/',
		sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/gateway/app/anonymization/'
	},
	{
		number: 7,
		title: 'Where your data lives: Data Residency',
		paragraphs: [
			"LQ-AI is self-hosted. By default, all conversation data, knowledge base content, and skill definitions stay within the operator's deployment — they never touch LegalQuants infrastructure. The only outbound path is the inference call from the Gateway to the chosen provider, and only when the matter's tier floor permits it. This map shows every data store, every outbound boundary, and which tiers cross each boundary. The Anonymization Layer middleware (M2-shipped — see playground 6 above) is one of the controls that crosses this surface; this map shows where its pre/post substitution sits relative to every storage and egress point in the system."
		],
		playground: 'data-residency',
		sourceLabel: 'docs/architecture.md',
		sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/docs/architecture.md'
	},
	{
		number: 8,
		title: 'Reviewing a contract: the Playbook execution cascade',
		paragraphs: [
			"A Playbook codifies an organization's standard positions on common contract issues. Applying one runs a four-node LangGraph cascade — retrieve → classify → redline → compile — that walks each position, extracts the matching clause, classifies it against the standard, and drafts a redline where it deviates. This playground steps through that cascade position-by-position against synthetic NDAs. The per-position references are the verbatim matched clause text (lexical FTS), not the M2 Citation Engine verification cascade — that integration is deferred."
		],
		playground: 'playbook-cascade',
		sourceLabel: 'api/app/playbooks/nodes.py',
		sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/api/app/playbooks/nodes.py'
	},
	{
		number: 9,
		title: 'Comparing many contracts: the Tabular Review grid',
		paragraphs: [
			'Tabular Review extracts the same set of questions across a set of documents and lays the answers out in a grid — one row per document, one column per question. Each cell is grounded in the chunks the model cited; click a cell to open its citation drawer. This playground renders a small grid of synthetic NDAs; the citation drawer shows the same fields the real surface does. Per-cell citations are display-only chunk references today (a synthetic citation id), not Citation-Engine-resolved provenance.'
		],
		playground: 'tabular-review',
		sourceLabel: 'api/app/tabular/nodes.py',
		sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/api/app/tabular/nodes.py'
	},
	{
		number: 10,
		title: 'Into the editor: the Word add-in install + auth flow',
		paragraphs: [
			"The Word add-in is an Office.js task pane installed against the operator's own deployment. This playground walks the four-stage flow: admin generates a per-deployment manifest, the operator sideloads the unsigned manifest via the Microsoft 365 Admin Center (which warns about the unsigned add-in — expected at v0.3.0), the task pane completes OAuth against the deployment, and the version handshake confirms compatibility. M3 shipped the plumbing only — the in-pane feature surface (chat, skills, playbooks) is deferred (DE-287; M4 closed without it — community-friendly), and the signed distribution package is community-led."
		],
		playground: 'word-addin-flow',
		sourceLabel: 'api/app/api/word_addin.py',
		sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/api/app/api/word_addin.py'
	},
	{
		number: 11,
		title: 'Seeing it all at once: the observability trace',
		paragraphs: [
			'Every chat-send is one OpenTelemetry trace spanning api → gateway → provider, with domain spans for citation verification, anonymization, skill dispatch, and inference carrying counts and types only — never raw entity values, prompt text, or response content. This playground lets you toggle the citation path, anonymization state, workflow type, and provider tier to see how the span tree changes, and shows which span attribute answers each of the five questions an operator is most likely to ask in production.'
		],
		playground: 'otel-eval',
		sourceLabel: 'docs/observability.md',
		sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/docs/observability.md'
	},
	{
		number: 12,
		title: 'Autonomy you can audit: the Autonomous flow',
		paragraphs: [
			'The Autonomous Layer (M4, shipped) runs a single agent on your behalf — on a schedule, or when documents arrive — without you watching each step. Because no human approves each action, the agent runs through declared phases behind one brake-checked chokepoint, and every run produces an auditable receipt. Step through a session below and trip each brake yourself.'
		],
		playground: 'autonomous-flow',
		sourceLabel: 'agentic-flow-alignment-guide.md',
		sourceUrl:
			'https://github.com/LegalQuants/lq-ai/blob/main/docs/LQVern/agentic-flow-alignment-guide.md'
	},
	{
		number: 13,
		title: 'The four autonomous primitives: watches, schedules, memory, precedent',
		paragraphs: [
			'An autonomous session does not run in isolation — it is wired to four primitives that decide when it runs and what it carries across runs. Watches trigger a session when matching documents arrive; schedules trigger it on a cron-like cadence; memory persists what a session learned so later runs build on it; and the precedent lifecycle promotes vetted work product into reusable precedent. This playground steps through each primitive and shows how it feeds the session you saw in playground 12. The Autonomous Layer shipped in M4.'
		],
		playground: 'autonomous-primitives',
		sourceLabel: 'api/app/api/autonomous.py',
		sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/api/app/api/autonomous.py'
	},
	{
		number: 14,
		title: 'Finding the right chunks: knowledge-base hybrid retrieval',
		paragraphs: [
			'When a message needs grounding context, LQ-AI does not rely on vector search alone. It runs hybrid retrieval: a lexical full-text-search pass (Postgres FTS) and a vector cosine-similarity pass run in parallel, and their results are fused into a single ranked set so that both exact-term matches and semantically-related passages surface. This playground lets you issue a query against synthetic KB chunks and watch the lexical scores, the vector scores, and the fused ranking that the engine ultimately uses. Knowledge-base retrieval shipped in M1.'
		],
		playground: 'kb-hybrid-retrieval',
		sourceLabel: 'api/app/knowledge/retrieval.py',
		sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/api/app/knowledge/retrieval.py'
	},
	{
		number: 15,
		title: "The matter's context: projects, org profile, and tier floors",
		paragraphs: [
			"Every request runs inside a matter (a project), and the matter carries the context that shapes it: the organization profile (the house voice and standard positions), the matter's attachments and knowledge bases, and its privilege flag and tier floor. This playground lets you configure a matter and watch how each of those settings flows into the assembled request — including how a privileged matter or a stricter tier floor narrows which providers the Gateway will permit. Projects, organization profiles, and tier floors shipped in M1."
		],
		playground: 'projects-org-tiers',
		sourceLabel: 'api/app/api/projects.py',
		sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/api/app/api/projects.py'
	},
	{
		number: 16,
		title: 'Getting work in: the Slack/Teams intake bridges',
		paragraphs: [
			'The intake bridges let an operator connect a Slack workspace or a Microsoft Teams tenant so that requests can flow into LQ-AI from where the business already works. This playground walks the OAuth install flow and the admin lifecycle (list, soft-delete) for a connected bridge.',
			'Honest partial state: the backend plumbing and admin lifecycle shipped in M3, but the live OAuth install handshake is unverified against real Slack and Teams tenants (DE-312), and the inbound /lq command path is inert — it does not yet dispatch a request (DE-288). Treat this surface as scaffolding, not a production-ready intake channel.'
		],
		playground: 'intake-bridges',
		sourceLabel: 'docs/intake-bridges.md',
		sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/docs/intake-bridges.md'
	}
];
