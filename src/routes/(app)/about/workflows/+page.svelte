<svelte:head><title>Workflows — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	The <strong>Workflows</strong> section is the single place in Donna where you save and organise
	reusable building blocks. One sidebar entry opens a hub with four tabs — <strong>Skills</strong>,
	<strong>Playbooks</strong>, <strong>Prompts</strong>, and <strong>Automations</strong> — each covering
	a different kind of reuse.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">Skills</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	A skill is a saved block of instructions that shapes how Donna responds to a message. When you
	attach a skill to the composer, those instructions are automatically included with your next send
	— you do not need to retype them each time.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	The <strong>Skills</strong> page lists your own skills under <strong>Your skills</strong> and a
	searchable catalogue of built-in skills below. Built-in skills cover common legal tasks and cannot
	be edited directly, but you can <strong>Fork</strong> any of them to create your own copy — the
	fork appears in <strong>Your skills</strong> and you can edit it freely.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	To author a skill from scratch, press <strong>New skill</strong>. The edit form lets you set a
	name, description, version, an optional slash command alias (e.g. <strong>/nda</strong>), tags,
	and the skill body — the instructions Donna receives. You can archive a skill you no longer need;
	it will be removed from the composer.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Some skills declare <strong>inputs</strong> — structured fields the skill expects you to fill in before
	sending. When you attach such a skill in the composer, an inputs panel appears inline. Required inputs
	are flagged; a skill with unfilled required inputs cannot be sent until they are provided. Optional
	inputs can be expanded separately. Input types include text, integer, boolean toggle, and enum (drop-down).
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">Playbooks</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	A playbook is a set of negotiation positions Donna applies to a contract document. Each position
	describes a clause topic and the stance Donna should take — preferred language, fallback, and
	non-negotiable limits — so you get consistent redlines every time instead of rewriting guidance
	from scratch.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	The <strong>Playbooks</strong> page groups available playbooks by contract family. Tap any
	playbook to open its detail view, which shows the full list of positions in order. From the detail
	view you can <strong>Apply to a document</strong> (admin accounts only in this version),
	<strong>Edit</strong>
	the playbook if you own it, <strong>Duplicate</strong> it to create a private copy, or
	<strong>Delete</strong> it.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	To create a new playbook, press <strong>New playbook</strong> from the list. Two paths are available:
</p>

<ul class="mb-3 ml-4 list-disc space-y-1 text-sm text-mlq-text">
	<li>
		<strong>Generate from documents</strong> — pick existing matter files and name a contract type; Donna
		drafts a full playbook from those documents and shows a review editor before you save.
	</li>
	<li>
		<strong>Start from scratch</strong> — open the playbook editor directly and build positions by hand.
	</li>
</ul>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">Saved Prompts</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Saved prompts are reusable text snippets accessible from the chat composer. When you find yourself
	typing the same phrasing repeatedly — a standard instruction, a preferred opener, a recurring
	question — you can save it once and insert it with two clicks.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	The <strong>Prompts</strong> page lists all your saved prompts. Press <strong>New prompt</strong> to
	create one with a name, body text, and optional tags. You can edit or delete any prompt from the same
	list.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	In the composer, the <strong>Prompts</strong> button opens a small picker above the input area.
	Type to filter by name or tag, then click a result to insert its text at your cursor. You can also
	save whatever you have already typed as a new prompt directly from the picker — name it and press
	<strong>Save</strong> without leaving the chat.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">Automations</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	The <strong>Automations</strong> tab is where Donna runs work on its own — one-off runs,
	cron-style schedules, and watches that fire when new documents arrive in a knowledge base, each
	with a full receipt of what the agent did and what it produced. See the dedicated
	<a href="/about/automations" class="font-medium text-mlq-strong hover:underline"
		>Automations guide</a
	>.
</p>
