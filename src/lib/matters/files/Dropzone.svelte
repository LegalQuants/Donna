<script lang="ts">
  import { UploadCloud } from '@lucide/svelte';

  let { onfiles }: { onfiles: (files: File[]) => void } = $props();

  let input = $state<HTMLInputElement>();
  let dragging = $state(false);

  function openPicker() {
    input?.click();
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  }
  function ondragenter(e: DragEvent) {
    e.preventDefault();
    dragging = true;
  }
  function ondragover(e: DragEvent) {
    e.preventDefault();
  }
  function ondragleave(e: DragEvent) {
    e.preventDefault();
    dragging = false;
  }
  function ondrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) onfiles(files);
  }
  function onchange(e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    const files = Array.from(target.files ?? []);
    if (files.length) onfiles(files);
    target.value = ''; // allow re-picking the same file later
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<button
  type="button"
  aria-label="Upload files to this matter"
  onclick={openPicker}
  {onkeydown}
  {ondragenter}
  {ondragover}
  {ondragleave}
  {ondrop}
  class="flex w-full flex-col items-center justify-center gap-2 rounded-mlq-control border-2 border-dashed border-mlq-subtle px-6 py-10 text-mlq-muted hover:border-mlq-workflow hover:text-mlq-text {dragging ? 'ring-2 ring-mlq-workflow border-mlq-workflow' : ''}"
>
  <UploadCloud size={24} aria-hidden="true" />
  <span class="text-sm">Drag PDFs or contracts here, or click to browse</span>
</button>
<!-- No `name` attribute: this input is a UI handle for the native picker only,
     not a form field. When Dropzone is nested inside a parent <form>, naming
     it 'file' would duplicate the file entry in the submitted form data —
     Dropzone's input value is cleared in onchange but only AFTER the parent's
     synchronous form.requestSubmit() reads it. The parent owns the canonical
     'file' input; this one is for opening the native picker. -->
<input
  bind:this={input}
  type="file"
  multiple
  data-testid="dropzone-input"
  {onchange}
  class="sr-only"
/>
