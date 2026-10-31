// Small UI icons (inline SVG, inherit currentColor unless noted).

const icon = (body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${body}</svg>`;

export const heartIcon = label => icon('<path d="M12 21s-7.5-4.6-9.5-9.2C1 8.1 3.4 4.5 7 4.5c2 0 3.6 1.1 5 2.8 1.4-1.7 3-2.8 5-2.8 3.6 0 6 3.6 4.5 7.3C19.5 16.4 12 21 12 21z" fill="#E0483A"/>', label);
export const treatIcon = label => icon('<g fill="#F3E2C3" stroke="#9C7344" stroke-width="1.5"><circle cx="6" cy="9" r="3"/><circle cx="6" cy="15" r="3"/><circle cx="18" cy="9" r="3"/><circle cx="18" cy="15" r="3"/><rect x="6" y="9.5" width="12" height="5" rx="1.5" stroke="none"/></g>', label);
export const starIcon = (filled, label) => icon(`<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="${filled ? '#F2B705' : 'none'}" stroke="${filled ? '#B88A0F' : 'currentColor'}" stroke-width="1.5"/>`, label);
export const lockIcon = () => icon('<rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/>');
export const shuffleIcon = () => icon('<path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');
export const closeIcon = () => icon('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>');
export const mudIcon = label => icon('<path d="M4 15c0-3 3-5 6-4 1-3 6-3 7 0 3 0 4 2 4 4s-2 4-4 4H7c-2 0-3-2-3-4z" fill="#8B5E3C"/>', label);
export const speakerIcon = muted => icon(`<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>${muted
  ? '<path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>'
  : '<path d="M16 8.5c1.2 1 1.8 2.2 1.8 3.5s-.6 2.5-1.8 3.5M18.5 6c2 1.6 3 3.6 3 6s-1 4.4-3 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>'}`);
export const pawStampSVG = () => icon('<g fill="currentColor"><ellipse cx="12" cy="15" rx="5" ry="4.2"/><ellipse cx="6" cy="9.5" rx="2" ry="2.6"/><ellipse cx="10" cy="6" rx="2" ry="2.6"/><ellipse cx="14" cy="6" rx="2" ry="2.6"/><ellipse cx="18" cy="9.5" rx="2" ry="2.6"/></g>');
