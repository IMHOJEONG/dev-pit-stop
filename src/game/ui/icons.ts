const paths: Record<string, string> = {
  character: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3M8 22v-5m8 5v-5"/>',
  mountain: '<path d="m2 19 7-13 5 8 3-5 5 10H2Z"/><path d="m7 10 2 2 2-2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5 5-3Z"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3v2m-1 3h.01"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  wood: '<path d="m12 2-7 10h4l-5 6h6v4h4v-4h6l-5-6h4L12 2Z"/>',
  stone: '<path d="m5 6 9-3 7 8-3 9H6l-4-8 3-6Zm0 0 4 7 12-2M9 13l-3 7"/>',
  crystal: '<path d="m12 2 7 7-3 11-4 2-4-2L5 9l7-7Zm0 0v20M5 9h14"/>',
  flag: '<path d="M5 22V3m0 1c5-4 9 4 15 0v11c-6 4-10-4-15 0"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  wind: '<path d="M3 8h12a3 3 0 1 0-3-3M3 12h17a3 3 0 1 1-3 3M3 16h7a3 3 0 1 1-3 3"/>',
  save: '<path d="M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8"/>',
};
export const icon = (name: string, cls = '') =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.compass}</svg>`;
