<svelte:head><title>Knowledge — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Knowledge bases</h1>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	What is a knowledge base?
</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	A <strong>Knowledge base</strong> is a named collection of documents that Donna can search when answering
	your questions. Instead of relying only on what the AI model already knows, Donna retrieves relevant
	passages from your uploaded documents and uses them to ground its answers — a technique called retrieval-augmented
	generation (RAG). This means answers can draw on your specific contracts, policies, research, or other
	materials rather than general training data.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Creating a knowledge base
</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Knowledge bases live inside <strong>Projects</strong>. Open a Project and find its
	<strong>Knowledge</strong> section: the picker there lets you link an existing KB or create a new one.
	When creating, you give the KB a name — pick something descriptive, such as "Acme Master Agreements"
	or "Company Policies Q4". Linking a KB to a Project makes its documents available to every chat in that
	Project.
</p>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Click a linked KB (or its <strong>Manage</strong> link) to open the knowledge base's own page. From
	there you can add files, review ingestion status, rename it, and tune its retrieval settings.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Renaming and describing a knowledge base
</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Open a KB and click <strong>Rename</strong> in the header. A dialog lets you update both the
	<strong>Name</strong>
	and an optional <strong>Description</strong>. Click <strong>Save</strong> to apply the changes.
	Press <strong>Cancel</strong> or hit Escape to close without saving.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Uploading documents
</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Inside a KB, the <strong>Files</strong> section shows all attached documents. If the KB is empty
	you will see a drop zone — drag files onto it or click to open a file picker. Once files are
	present, use the <strong>+ Add file</strong> button to upload more.
</p>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	After upload, each file moves through ingestion states: <strong>Pending</strong> →
	<strong>Processing</strong>
	→ <strong>Ready</strong>. Donna polls automatically and attaches the file once it is ready. If a
	file is still processing after several minutes, a <strong>Refresh</strong> prompt appears. Files
	that cannot be ingested show a <strong>Failed</strong> status with an error message.
</p>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	<strong>Recommended format: PDF.</strong> PDF files ingest reliably. Some other file types —
	including plain <code>.txt</code> files — may be rejected with an "unsupported type" error. If a file
	fails to ingest, try converting it to PDF before uploading.
</p>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	To remove a document, click the <strong>×</strong> icon next to the file row. This detaches the
	file from the KB; it will no longer be searched when Donna retrieves context. Ready files also
	show a <strong>Download</strong> link so you can retrieve the original document directly from the KB.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	How retrieval works
</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	When you chat within a Project that has a linked knowledge base, Donna searches those documents
	for the passages most relevant to your query. Matching chunks are included in the context sent to
	the AI model, so the answer is grounded in your actual materials rather than model knowledge
	alone.
</p>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Each KB also exposes a <strong>Hybrid alpha</strong> control (in the <strong>Advanced</strong> section
	of the KB detail view). This slider blends two retrieval strategies: pure vector similarity search at
	one end, and full-text search (FTS) at the other. The default balance works well for most document types;
	you can tune it if you find one strategy returns better results for your content.
</p>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Answers that draw from a knowledge base cite their sources so you can verify exactly which
	document and passage the answer came from. See the <strong>Trust &amp; citations</strong> page for a
	full explanation of how citations work in Donna.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Archiving a knowledge base
</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	When a knowledge base is no longer needed, open it and click <strong>Archive</strong> in the header.
	Archived KBs are removed from the active list and will not be searched. This is useful for keeping the
	Knowledge view tidy without permanently deleting documents.
</p>
