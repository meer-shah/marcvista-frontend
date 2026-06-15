import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { connectionApi } from '@/lib/api';

interface Props {
  open: boolean;
  exchange: string | null;
  onOpenChange: (open: boolean) => void;
}

/** Escape the three HTML-significant characters so any raw HTML in the source
 *  is rendered as inert text, not live DOM. Runs BEFORE the markdown transforms
 *  below, which inject their own (trusted) tags — so a malicious guide file
 *  containing e.g. `<img src=x onerror=...>` can't become an XSS sink, while
 *  well-formed markdown renders byte-for-byte the same (markdown's structural
 *  characters `# | * \` [ ] ( )` are not escaped). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Minimal markdown → HTML — covers headings, lists, bold, code, links, tables.
 *  Avoids pulling in a full library; the guides we ship are well-formed.
 *  Source is HTML-escaped first (see escapeHtml) so the raw injection is safe. */
function markdownToHtml(md: string): string {
  let html = escapeHtml(md)
    // tables (rudimentary)
    .replace(/^\|(.+)\|\n\|([:\- |]+)\|\n((?:\|.+\|\n?)+)/gm, (_, headRow, _align, body) => {
      const heads = headRow.split('|').map((s: string) => s.trim()).filter(Boolean);
      const rows = body.trim().split('\n').map((r: string) =>
        r.split('|').map((c: string) => c.trim()).filter((_c: string, _i: number, arr: string[]) => arr.length > 0)
      ).filter((r: string[]) => r.length);
      return `<table class="my-3 border-collapse text-xs"><thead><tr>${heads.map((h: string) => `<th class="border border-white/10 px-2 py-1 bg-white/5 text-left">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r: string[]) => `<tr>${r.map((c: string) => `<td class="border border-white/10 px-2 py-1">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    })
    .replace(/^### (.*)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.*)$/gm, '<h2 class="text-lg font-semibold mt-5 mb-2 text-[#e8590c]">$1</h2>')
    .replace(/^# (.*)$/gm, '<h1 class="text-xl font-bold mt-2 mb-3">$1</h1>')
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-white/10 text-xs tabular-nums">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="text-[#e8590c] underline" target="_blank" rel="noopener" href="$2">$1</a>')
    // ordered list items (1. ...)
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // unordered list items (- ... or  - ...)
    .replace(/^[-*]\s+(.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // paragraphs
    .split(/\n\n+/).map(block => {
      if (/^<(h[1-6]|li|table|ul|ol|pre)/.test(block)) return block;
      return `<p class="text-sm leading-relaxed my-2 text-muted-foreground">${block.replace(/\n/g, ' ')}</p>`;
    }).join('\n');
  // Wrap loose <li> groups in <ul>
  html = html.replace(/(<li[^>]*>.*?<\/li>\s*)+/gs, m => `<ul class="my-2 space-y-1">${m}</ul>`);
  return html;
}

const GuideModal: React.FC<Props> = ({ open, exchange, onOpenChange }) => {
  const [md, setMd] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !exchange) return;
    setLoading(true); setErr(null); setMd('');
    connectionApi.getGuide(exchange)
      .then(setMd)
      .catch(e => setErr(e?.message || 'Failed to load guide'))
      .finally(() => setLoading(false));
  }, [open, exchange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[min(80vh,calc(100vh-120px))] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="capitalize">{exchange || ''} — Connection Guide</DialogTitle>
        </DialogHeader>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {err && <p className="text-sm text-red-500">{err}</p>}
        {!loading && !err && (
          <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: markdownToHtml(md) }} />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default GuideModal;
