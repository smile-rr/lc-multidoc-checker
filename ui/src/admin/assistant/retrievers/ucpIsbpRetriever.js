import seed from '../../mockData.json';

const STOP = new Set([
  'a','an','the','of','to','in','for','on','at','by','and','or','is','are','be','as','it','that','this','with','from','any','all','must','shall','should','may','not','no','its','if','than','then','only','one','more','less','same','such','their','have','has','had','will','was','were','been','being','about','into','out','within','per','via','also','other','these','those','which','what','when','how','why','where',
]);

const docs = (() => {
  const out = [];
  for (const r of seed.refs.ucp600 || []) {
    out.push({ id: r.id, source: 'UCP600', heading: r.heading, text: r.text, article: r.article, paragraph: r.paragraph });
  }
  for (const r of seed.refs.isbp821 || []) {
    out.push({ id: r.id, source: 'ISBP821', heading: r.heading, text: r.text, paragraph: r.paragraph });
  }
  return out;
})();

const tokenize = (s) => (s || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, ' ')
  .split(/\s+/)
  .filter((t) => t && t.length > 2 && !STOP.has(t));

const docTokens = docs.map((d) => ({ ...d, _tokens: new Set(tokenize(d.heading + ' ' + d.text)) }));

export const lookupRef = (id) => docs.find((d) => d.id === id || d.id.toLowerCase() === id.toLowerCase());

export const search = (query, limit = 3) => {
  const q = tokenize(query);
  if (!q.length) return [];
  const scored = docTokens.map((d) => {
    let s = 0;
    for (const t of q) if (d._tokens.has(t)) s += 1;
    if (q.some((t) => d.heading.toLowerCase().includes(t))) s += 1.5;
    return { d, s };
  }).filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit);
  return scored.map(({ d }) => ({ id: d.id, source: d.source, heading: d.heading, text: d.text }));
};

export const allRefs = () => docs.map(({ _tokens, ...d }) => d);

export const refsByArticleRange = (source, articleFrom, articleTo) => docs
  .filter((d) => d.source === source && d.article && +d.article >= articleFrom && +d.article <= articleTo);
