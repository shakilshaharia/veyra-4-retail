// Rank Math-style content analysis: a set of checks on how well a page is
// optimised for its focus keyword, rolled up into a 0–100 score. Only the
// checks that apply (given the data we have) count toward the score.

export type CheckStatus = 'good' | 'warn' | 'bad';
export type SeoCheck = { id: string; label: string; status: CheckStatus };

export type AnalysisInput = {
  focusKeyword: string;
  seoTitle: string; // effective (with fallback)
  metaDescription: string; // effective
  slug: string;
  contentText?: string; // plain text of the body
  contentHtml?: string; // for heading/image checks
  hasFeaturedImage?: boolean;
  isArticle?: boolean; // apply content-length / image checks
};

export type Analysis = { score: number; checks: SeoCheck[]; keywordSet: boolean };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export function analyzeSeo(input: AnalysisInput): Analysis {
  const kw = norm(input.focusKeyword);
  const checks: SeoCheck[] = [];
  const add = (id: string, label: string, status: CheckStatus) => checks.push({ id, label, status });

  // --- Title ---
  const titleLen = input.seoTitle.trim().length;
  add('title-length', titleLen === 0 ? 'Add an SEO title' : titleLen < 15 ? `SEO title is short (${titleLen} chars)` : titleLen > 60 ? `SEO title may be cut off (${titleLen} chars)` : `SEO title length is good (${titleLen} chars)`, titleLen >= 15 && titleLen <= 60 ? 'good' : titleLen === 0 ? 'bad' : 'warn');

  // --- Description ---
  const descLen = input.metaDescription.trim().length;
  add('desc-length', descLen === 0 ? 'Add a meta description' : descLen < 70 ? `Meta description is short (${descLen} chars)` : descLen > 160 ? `Meta description may be cut off (${descLen} chars)` : `Meta description length is good (${descLen} chars)`, descLen >= 70 && descLen <= 160 ? 'good' : descLen === 0 ? 'bad' : 'warn');

  if (!kw) {
    add('keyword', 'Set a focus keyword to analyse keyword usage', 'warn');
  } else {
    add('kw-title', 'Focus keyword in the SEO title', norm(input.seoTitle).includes(kw) ? 'good' : 'bad');
    add('kw-title-start', 'SEO title starts with the focus keyword', norm(input.seoTitle).startsWith(kw) ? 'good' : 'warn');
    add('kw-desc', 'Focus keyword in the meta description', norm(input.metaDescription).includes(kw) ? 'good' : 'bad');
    add('kw-url', 'Focus keyword in the URL', norm(input.slug.replace(/-/g, ' ')).includes(kw) ? 'good' : 'warn');

    if (input.contentText !== undefined) {
      const content = norm(input.contentText);
      const words = content ? content.split(' ').length : 0;
      add('kw-content', 'Focus keyword appears in the content', content.includes(kw) ? 'good' : 'bad');
      const firstChunk = content.split(' ').slice(0, 60).join(' ');
      add('kw-intro', 'Focus keyword near the beginning', firstChunk.includes(kw) ? 'good' : 'warn');
      // Density
      const occurrences = kw ? content.split(kw).length - 1 : 0;
      const density = words ? (occurrences * kw.split(' ').length * 100) / words : 0;
      add('kw-density', occurrences === 0 ? 'Keyword density is 0%' : `Keyword density ${density.toFixed(1)}%`, density >= 0.5 && density <= 2.5 ? 'good' : density === 0 ? 'bad' : 'warn');
      if (input.contentHtml) {
        const headings = (input.contentHtml.match(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi) ?? []).map((h) => norm(h.replace(/<[^>]+>/g, '')));
        add('kw-subheading', 'Focus keyword in a subheading', headings.some((h) => h.includes(kw)) ? 'good' : 'warn');
      }
    }
  }

  if (input.isArticle && input.contentText !== undefined) {
    const words = norm(input.contentText) ? norm(input.contentText).split(' ').length : 0;
    add('content-length', words >= 600 ? `Good content length (${words} words)` : words >= 300 ? `Content length is okay (${words} words)` : `Content is thin (${words} words)`, words >= 600 ? 'good' : words >= 300 ? 'warn' : 'bad');
    const hasImg = input.hasFeaturedImage || /<img\b/i.test(input.contentHtml ?? '');
    add('has-image', hasImg ? 'Has an image' : 'Add at least one image', hasImg ? 'good' : 'warn');
  }

  const scored = checks.filter((c) => c.id !== 'keyword');
  const points = scored.reduce((sum, c) => sum + (c.status === 'good' ? 1 : c.status === 'warn' ? 0.5 : 0), 0);
  const score = scored.length ? Math.round((points / scored.length) * 100) : 0;
  return { score, checks, keywordSet: Boolean(kw) };
}

export function scoreTone(score: number): { label: string; className: string } {
  if (score >= 80) return { label: 'Good', className: 'text-emerald-600' };
  if (score >= 50) return { label: 'Needs work', className: 'text-amber-600' };
  return { label: 'Poor', className: 'text-red-600' };
}
