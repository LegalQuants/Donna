<svelte:head><title>Research — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Research</h1>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Searching case law
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	The <strong>Research</strong> tab in the sidebar opens a dedicated workspace for U.S. case law.
	Donna looks up court opinions through <strong>CourtListener</strong>, a free repository of
	millions of decisions. Search by topic (e.g. <em>"Chevron deference"</em>) or by case name (e.g.
	<em>"Brown v. Board of Education"</em>), and narrow results with the court and sort-order filters.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Click any result to open the full opinion in the document panel and read the decision. Once an
	opinion is open, use <strong>Find in opinion</strong> to jump to a phrase within it.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Verifying citations
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	The <strong>Verify citations</strong> tool takes text containing reporter citations (for example a paragraph
	from a brief) and checks each citation against CourtListener, linking the ones it finds to the matching
	case. It is a fast way to confirm that the authorities in a document are real and correctly cited.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Research from chat
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	You can also simply ask the <strong>Assistant</strong> to research for you — for example,
	<em>"Find a landmark Supreme Court case on free speech and cite it."</em> When Donna consults case
	law to answer, it shows a <strong>"⚖ sources consulted"</strong> note beneath the reply listing the
	cases it pulled in, each linking out to CourtListener so you can read the original.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">Availability</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Case-law research is enabled by your administrator with a CourtListener API token, so each
	operator brings their own key. If the Research tab says it isn't enabled, ask your administrator
	to add a token for this deployment.
</p>
