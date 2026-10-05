// Reads prices from photos with Claude, using the person's own Anthropic API key.
// The photo is sent to the Anthropic API and then forgotten. It is never saved to GitHub.

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
const OK_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export class ReaderError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

// Shrinks a photo to at most 1568 px on the long side (plenty for reading text, and cheaper).
export async function prepareImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    if (blob) return blob;
  } catch { /* fall through */ }
  if (!OK_TYPES.includes(file.type)) throw new ReaderError('This photo format can’t be read. Use a JPEG or PNG.', 0);
  return file;
}

const toBase64 = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = () => rej(new ReaderError('Couldn’t open the photo.', 0));
  r.readAsDataURL(blob);
});

export function buildPrompt({ kind, shopName, knownNames, count }) {
  return `${count > 1 ? `These ${count} images are parts of one` : 'This image is a'} ${kind === 'bill' ? 'grocery receipt' : 'photo of grocery shelf price tags or a shop price list'} from the shop "${shopName}".
Extract every product, its price, and the amount that price is for.
Reply with ONLY this JSON and nothing else:
{"date": "YYYY-MM-DD" or null, "items": [{"name": string, "price": number, "amount": number, "unit": "g" | "kg" | "ml" | "L" | "each"}]}
Rules:
- "price" is what ONE pack costs. If a line shows several packs (e.g. 2 @ 3.50 = 7.00), the price is 3.50.
- "amount" and "unit" describe one pack: 500 g bag -> 500 "g"; 2 L bottle -> 2 "L"; dozen eggs -> 12 "each"; a single item with no size -> 1 "each".
- Weighed items (e.g. 0.85 kg @ 4.00/kg = 3.40): price is the line total (3.40), amount 0.85, unit "kg".
- If a shelf tag shows only a unit price (e.g. 4.00 per kg), use price 4.00, amount 1, unit "kg".
- Take the pack size from the product name or label when it is shown there.
- If a discount line clearly belongs to the product above it, subtract it from that product's price.
- Skip subtotals, totals, tax, payment, change, bags and loyalty points.
- ${kind === 'bill' ? '"date" is the purchase date printed on the receipt, or null.' : '"date" is null unless a date is clearly printed.'}
- "name" is a short readable product name with brand but WITHOUT the pack size (e.g. "Dairy Farmers Full Cream Milk"), not receipt abbreviations.
- If a product is clearly the same product (same brand, any pack size) as one of these tracked names, use the tracked name exactly:
${knownNames.length ? knownNames.map(n => '  - ' + n).join('\n') : '  (none yet)'}`;
}

export function parseReply(text) {
  const s = String(text).replace(/```(?:json)?/g, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new ReaderError('The reply wasn’t in the expected format. Try again.', 0);
  let j;
  try { j = JSON.parse(s.slice(a, b + 1)); } catch { throw new ReaderError('The reply wasn’t in the expected format. Try again.', 0); }
  const items = (Array.isArray(j.items) ? j.items : [])
    .filter(x => x && typeof x.name === 'string' && x.name.trim())
    .map(x => ({
      name: x.name.trim(),
      price: Number(x.price) > 0 ? Math.round(Number(x.price) * 100) / 100 : '',
      amount: Number(x.amount) > 0 ? Number(x.amount) : 1,
      unit: ['g', 'kg', 'ml', 'L', 'each'].includes(x.unit) ? x.unit : x.unit === 'l' ? 'L' : 'each',
    }));
  return { date: typeof j.date === 'string' ? j.date : null, items };
}

export async function readPrices({ apiKey, model, images, kind, shopName, knownNames, signal }) {
  if (!apiKey) throw new ReaderError('Add your Anthropic API key in Settings to read photos.', 0);
  const content = [];
  for (const img of images) {
    content.push({ type: 'image', source: { type: 'base64', media_type: OK_TYPES.includes(img.type) ? img.type : 'image/jpeg', data: await toBase64(img) } });
  }
  content.push({ type: 'text', text: buildPrompt({ kind, shopName, knownNames, count: images.length }) });

  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: model || DEFAULT_MODEL, max_tokens: 4096, messages: [{ role: 'user', content }] }),
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new ReaderError('Can’t reach the Anthropic API. Check your internet connection.', 0);
  }
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).error?.message || ''; } catch { /* ignore */ }
    if (res.status === 401) throw new ReaderError('The Anthropic API key was rejected. Check it in Settings.', 401);
    if (res.status === 404) throw new ReaderError(`The model “${model}” wasn’t found. Check the model name in Settings.`, 404);
    if (res.status === 429) throw new ReaderError('Too many requests. Wait a minute and try again.', 429);
    if (res.status === 529 || res.status >= 500) throw new ReaderError('The Anthropic API is busy. Try again shortly.', res.status);
    throw new ReaderError(`Couldn’t read the photo${msg ? ': ' + msg : '.'}`, res.status);
  }
  const j = await res.json();
  return parseReply((j.content || []).filter(c => c.type === 'text').map(c => c.text).join(''));
}
