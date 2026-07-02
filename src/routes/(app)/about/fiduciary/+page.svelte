<svelte:head><title>Fiduciary receipts — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Fiduciary receipts</h1>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Donna keeps an <strong>honest provenance record on every answer</strong>: for each reply, what
	sources it used, exactly what it quoted from each, whether that quote was actually found in the
	real source, and — for cases — signals about how later courts have treated it. You never have to
	take the answer on faith; you can trace any claim back to where it came from.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	The four trust states
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Every assistant answer carries a small <strong>trust pill</strong> that tells you, at a glance, how
	well its quoted claims held up when Donna checked them against their sources:
</p>

<ul class="mb-3 ml-4 list-disc space-y-1 text-sm text-mlq-text">
	<li>
		<strong>Fiduciary-grade (green).</strong> The answer made sourced claims and every quoted claim was
		matched against its original source.
	</li>
	<li>
		<strong>Supported (amber).</strong> The claims are backed by the sources in substance — verified by
		meaning rather than an exact quote match.
	</li>
	<li>
		<strong>Needs review (red).</strong> At least one quoted claim could not be confirmed in its source.
		Read the flagged quote against the original before relying on it.
	</li>
	<li>
		<strong>No sourced claims (neutral grey).</strong> This answer did not quote or rely on a
		specific source. It is deliberately <em>never</em> shown as green: with nothing to verify, "verified"
		would be misleading — nothing to verify is not the same as verified.
	</li>
</ul>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Try each state below — pick what happened when Donna verified an answer, and see the exact pill
	you would get. Toggling "made sourced claims" off shows the honesty rule in action.
</p>

<iframe
	src="/learn/playgrounds/trust-states.html"
	title="Trust states — interactive"
	loading="lazy"
	class="mt-2 h-[520px] w-full rounded-mlq-control border border-mlq-subtle"
></iframe>
<div class="mt-2 text-xs text-mlq-muted">
	<a
		href="/learn/playgrounds/trust-states.html"
		target="_blank"
		rel="noopener noreferrer"
		class="text-mlq-strong hover:underline">Open full-screen ↗</a
	>
</div>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	The receipt & citation ledger
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Click the trust pill to open the <strong>fiduciary receipt</strong> — the citation ledger for that
	answer. It lists each source the assistant actually read, the exact passage it quoted, and a
	verification chip for that quote, so you can <strong>trace any claim to its source</strong> in one
	click. Knowledge-base sources open in the document panel; cases open the opinion; statutes and
	regulations link out to the authority. The ledger records
	<em>what was read and whether the quote matched</em>, referenced by identifier and passage
	location — not by stashing copies of the source text.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Beneath the answer-level trust pill, the engine buckets each individual citation into pass /
	supported / fail — a different layer from the four turn-level states above.
	<a
		href="/learn/playgrounds/citation-ledger.html"
		target="_blank"
		rel="noopener noreferrer"
		class="text-mlq-strong hover:underline">Explore the citation ledger ↗</a
	>
	·
	<a
		href="/learn/playgrounds/fiduciary-gate.html"
		target="_blank"
		rel="noopener noreferrer"
		class="text-mlq-strong hover:underline">the fiduciary gate ↗</a
	>
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Case treatment (validity)
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Where an answer relies on case law, the receipt can show <strong>derived treatment signals</strong
	>
	— how often the case has been cited and whether later courts followed, distinguished, or criticised
	it — each with a trace to the citing case. This is <strong>derived, not editorial</strong>: it is
	a signal to guide your own reading, <em>not</em> an authoritative citator, and Donna never colours a
	case "good" or "bad" law for you.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	<a
		href="/learn/playgrounds/treatment-layer.html"
		target="_blank"
		rel="noopener noreferrer"
		class="text-mlq-strong hover:underline">Explore how treatment signals are derived ↗</a
	>
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Matter sessions — the audit timeline
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	When Donna runs an autonomous matter session, its receipt is the same fiduciary record at the
	matter level — a timeline of who did what, on whose behalf, at what cost, alongside a session-wide
	trust pill answering the one question a reviewer cares about: <strong
		>is this work product fiduciary-grade?</strong
	>
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	<a
		href="/learn/playgrounds/matter-session-flow.html"
		target="_blank"
		rel="noopener noreferrer"
		class="text-mlq-strong hover:underline">Explore a governed matter session ↗</a
	>
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Authoritative sources
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	The Research page lists the primary-law sources this instance can reach — U.S. case law
	(CourtListener), the U.S. Code and CFR (GovInfo), public filings (SEC EDGAR), and EU legislation
	and CJEU case law (EUR-Lex). Each is retrieved <em>and</em> character-verified through the same governed
	path. Availability depends on how your operator has configured the instance, and EU law is currently
	fetch-by-identifier (CELEX) only; a source that isn't configured shows as unavailable rather than silently
	disappearing.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	<a
		href="/learn/playgrounds/authority-sources.html"
		target="_blank"
		rel="noopener noreferrer"
		class="text-mlq-strong hover:underline">Explore the authoritative-source registry ↗</a
	>
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Take it with you — provenance export
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	From any chat turn or matter session you can <strong>export the provenance record</strong> — a
	structured JSON file and a printable Markdown copy of the whole sourcing trail. It is labelled
	honestly for what it is: a faithful copy of the record,
	<strong>not a cryptographically signed attestation</strong>. It is designed so that, when a signed
	export becomes available, the same button can produce it.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">Under the hood</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Want to see how a quote actually gets verified? The LQ-AI engine runs a four-stage
	character-fidelity cascade on every quoted passage.
	<a
		href="/learn/playgrounds/citation-engine-cascade.html"
		target="_blank"
		rel="noopener noreferrer"
		class="text-mlq-strong hover:underline">Drill into how a quote is verified ↗</a
	>
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	The interactive walkthroughs linked above are <strong>illustrative</strong> — self-contained examples
	of how the LQ-AI engine works, not your live data — and each links onward to the real backend module
	or decision record it depicts.
</p>
