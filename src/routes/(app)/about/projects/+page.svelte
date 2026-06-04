<svelte:head><title>Projects — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Projects</h1>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">What is a Project?</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  A <strong>Project</strong> groups related chats, files, knowledge bases, skills, and standing context under one name. Instead of starting every conversation from scratch, you give Donna a shared foundation — background notes, uploaded documents, and relevant knowledge — that applies automatically to every chat inside that Project.
</p>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  <strong>A note on naming:</strong> the sidebar entry is labelled <strong>Projects</strong>. In some parts of the interface (page headings, form labels, archive dialogs) you will see the word <strong>matter</strong> instead. These refer to the same thing; the terms are interchangeable.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Creating a Project</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Open <strong>Projects</strong> in the sidebar. Click <strong>New matter</strong> in the top-right corner. A dialog asks for:
</p>
<ul class="mb-3 ml-4 list-disc space-y-1 text-sm text-mlq-text">
  <li><strong>Matter name</strong> — required. Choose something that reflects the engagement or topic.</li>
  <li><strong>Description</strong> — optional free text shown beneath the name in the list.</li>
  <li><strong>Privileged matter</strong> — see below.</li>
  <li><strong>Minimum model tier</strong> — see below.</li>
</ul>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Once created, the Project appears in the list sorted by last activity. You can <strong>Rename</strong> it at any time from the Project detail page; you can also <strong>Archive</strong> it to remove it from your active list without deleting any chats inside it.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Privilege and minimum model tier</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Checking <strong>Privileged matter</strong> does two things:
</p>
<ul class="mb-3 ml-4 list-disc space-y-1 text-sm text-mlq-text">
  <li>Every chat started inside the Project is flagged as privileged in the audit log.</li>
  <li>A <strong>Minimum model tier</strong> (1–5) becomes required — you must choose one before you can save a privileged Project. Higher tiers require cloud-hosted models.</li>
</ul>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Privileged Projects display a <strong>Privileged</strong> badge — a small lock-icon pill — next to the Project name in the list and on the Project detail page. Non-privileged Projects can optionally set a minimum tier without enabling the privileged flag.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Attaching files</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The <strong>Files</strong> section on a Project's detail page lets you attach documents directly to the Project. When no files have been added yet, a drop zone is shown — drag files onto it or click to open the file picker. After the first upload an <strong>+ Add file</strong> button appears below the file list so you can keep adding more. Uploaded files are available to chats in that Project and to any linked knowledge base workflows.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Knowledge bases and skills</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  A Project can be linked to one or more <strong>Knowledge</strong> bases. Linking a knowledge base makes its indexed documents retrievable during every chat in the Project. Use the <strong>Knowledge</strong> section on the detail page to link or unlink bases; the <strong>Manage</strong> link takes you to a knowledge base's own settings.
</p>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The <strong>Skills</strong> section lets you attach named skills to a Project. Attached skills appear as removable tags and are available to Donna when answering chats scoped to that Project.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Standing context</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The <strong>Context</strong> section holds free-form Markdown that Donna receives at the start of every chat in the Project — no matter who starts it or when. Use it for background facts, formatting preferences, recurring instructions, or any information that would otherwise need to be repeated in every prompt. The field supports up to 100 KiB of text; a live byte counter is shown as you type.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Scoping a chat to a Project</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  From the Project detail page, click <strong>+ New chat in this matter</strong>. The chat opens already scoped to the Project: Donna receives the standing context, can draw on linked knowledge and skills, and sees the attached files. The chat list at the bottom of the detail page shows all chats ever started in that Project, with a message count for each.
</p>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  If a Project is marked privileged, the minimum tier setting is also enforced for those chats, ensuring they are handled by a model at or above the required capability level.
</p>
