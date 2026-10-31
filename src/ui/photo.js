// The dog's real photo in a round frame (map marker, report card), with the cartoon look
// standing in when there's no photo or it won't load.

import { h } from './dom.js';
import { dogSVG } from './art.js';

const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

// Cuts a name to `max` characters as people see them (an emoji counts as one), then "…".
export function shortName(name, max = 14) {
  const text = String(name ?? '');
  const chars = segmenter ? [...segmenter.segment(text)].map(s => s.segment) : [...text];
  return chars.length <= max ? text : `${chars.slice(0, max).join('').trimEnd()}…`;
}

export function dogPhoto(url, { size = 44, alt = 'Your dog', look = {} } = {}) {
  const frame = h('span', { class: 'dog-photo', style: `width:${size}px;height:${size}px` });
  const cartoon = () => { frame.classList.add('cartoon'); frame.innerHTML = dogSVG({ ...look, label: alt }); };
  if (!url) { cartoon(); return frame; }
  const img = h('img', { src: url, alt, loading: 'lazy', decoding: 'async' });
  img.addEventListener('error', cartoon, { once: true });
  frame.append(img);
  return frame;
}
