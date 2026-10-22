/* The keys the ? panel shows. Press ? (Shift + /) in the game, or tap the round ? button (top left).
   The panel and the freeze live in the shared kit: kit/help.js (Kit.help). */
Kit.help.setup({
  title: window.JP_TITLE,
  cols: ['Teddy (left)', 'Tommy (right)'],
  keys: [
    ['hold to fly, let go to fall', 'W or Space', '↑ or Enter'],
    ['call your brother · high five', 'T', 'T'],
    ['who flies', '← →', '← →'],
    ['level 🐣 / 🔥', 'W S', '↑ ↓'],
    ['fly! · again', 'Enter or Space', 'Enter or Space'],
    ['pause', 'P or Esc', 'P or Esc'],
    ['sound on / off', 'M', 'M'],
  ],
  note: 'Dodge the zappers and grab the coins all the way to the exit. Whoever has the most coins wins. In 1 player both sets of keys work and T calls your brother: he brings a treat and a shield that zappers bounce off. With 2 players, T is a high five.',
  touch: 'Hold anywhere to fly (with 2 players, Teddy holds the left half and Tommy the right). Tap your brother\'s face to call him.',
  button: { top: 'calc(env(safe-area-inset-top, 0px) + 10px)', left: 'max(10px, env(safe-area-inset-left, 0px))' },
});
// The language button goes right under the ? button, and the kit's speaker under that: a column in the top left corner,
// above the lab's ceiling, left of the coin counters.
Kit.lang.setup({ button: { top: 'calc(env(safe-area-inset-top, 0px) + 58px)', left: 'max(10px, env(safe-area-inset-left, 0px))' } });
