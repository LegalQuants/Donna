<svelte:head><title>Tools & connections — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Tools &amp; connections</h1>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Beyond answering from your documents and knowledge bases, Donna's assistant can use <strong
		>tools</strong
	>
	— external services that look things up or take an action — when they help answer your request. Donna
	keeps you in control of when and whether a tool runs.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">MCP tools</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	<strong>MCP</strong> (Model Context Protocol) servers are collections of external tools your
	administrator connects to the deployment — for example a documentation or reference lookup. Under
	<strong>Settings → MCP</strong> you can see which servers are connected and enable the individual tools
	you want the assistant to be able to use.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Approving a tool in chat
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	When the assistant wants to use a tool, it pauses and asks first: a card appears in the chat
	naming the tool and what it will do, with <strong>Approve</strong> and <strong>Deny</strong> buttons.
	Approve lets it run that one time; Deny skips it and the assistant continues without it. Tools that
	could change something are flagged as destructive. Nothing external happens without your click.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">Connections</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Some tool servers require you to sign in with your own account. Under
	<strong>Settings → Connections</strong> you connect each one once; afterwards the assistant can
	use it on your behalf. If you start a chat that needs a connection you haven't made yet, the
	assistant shows a <strong>Connect</strong> prompt inline so you can link it on the spot.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Where answers came from
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	When a tool pulls in outside material — such as case law from CourtListener — Donna shows a
	<strong>"sources consulted"</strong> note beneath the answer listing those external sources with
	links. This is separate from the green / amber / red <strong>verified-quote citations</strong>
	described on the <strong>Trust &amp; citations</strong> page: those check a quote against a source,
	while "sources consulted" simply records which outside materials the assistant looked at.
</p>
