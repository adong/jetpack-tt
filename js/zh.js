/* 中文 for TT Jetpack: the words on the page, the toasts, the exit sign and the ? panel (Kit.lang, from kit/lang.js).
   Simple words: Tommy is 5. 喷气背包 (jetpack), 金币 (coins), 电网 (zappers), 护盾 (shield), 出口 (exit). The kids'
   names, Foxy and Froggy, and the game's own name stay in English on purpose. */
(function () {
  const L = Kit.lang;
  const title = window.JP_TITLE;
  const words = title.split(' ');
  L.keep(['TEDDY', 'TOMMY', 'FOXY', 'FROGGY', 'Teddy', 'Tommy', title, words.slice(0, -1).join(' '), words[words.length - 1], 'TT', 'Esc', 'Claude Code']);

  L.add({
    // home
    'Hold to fly! Dodge the zappers, grab the coins.': '按住就能飞！躲开电网，抓金币！',
    'WHO FLIES?': '谁来飞？', 'Who flies': '谁来飞', 'BOTH': '一起飞', '2 PLAYERS': '双人',
    'Level for Teddy (W S)': 'Teddy 的难度 (W S)', 'Level for Tommy (↑ ↓)': 'Tommy 的难度 (↑ ↓)',
    'Race Foxy 🦊 and Froggy 🐸 for coins!': '和 Foxy 🦊、Froggy 🐸 比赛抓金币！',
    'Teddy and Tommy race for coins!': 'Teddy 和 Tommy 比赛抓金币！',
    '▶ FLY!': '▶ 起飞！', 'hold to fly': '按住飞', 'call': '叫', 'a high five': '击掌', 'who flies': '谁来飞',
    'pause': '暂停', 'sound': '声音', 'Hold anywhere to fly. Let go to fall.': '按住屏幕就能飞，松开就往下掉。',
    'built with': '制作工具', '🐣 EASY': '🐣 简单', '🔥 NORMAL': '🔥 普通',
    // flying
    'Pause': '暂停', 'Pause (P)': '暂停 (P)', 'Sound (M)': '声音 (M)', 'Sound on or off': '声音 开 / 关',
    'Call your brother (T)': '叫兄弟来帮忙 (T)', 'High five (T)': '击掌 (T)', 'HIGH FIVE': '击掌',
    'HOLD TO FLY!': '按住就能飞！', 'GO!': '出发！', '🏁 EXIT!': '🏁 到出口啦！', 'EXIT': '出口',
    '🛡️ SHIELD BLOCK!': '🛡️ 护盾挡住啦！', '⚡ ZAPPED!': '⚡ 被电晕啦！', '✋ HIGH FIVE!': '✋ 击掌！', '❤️ +1': '❤️ +1',
    // pause, results
    'PAUSED': '暂停中', 'P · Esc · Space': 'P · Esc · 空格键', '▶ KEEP FLYING': '▶ 继续飞', '🏠 HOME': '🏠 主页', '↻ PLAY AGAIN': '↻ 再玩一次',
    '★ NEW BEST! ★': '★ 新纪录！★', 'DISTANCE': '飞了多远', "🏆 IT'S A TIE!": '🏆 平手！',
    // the ? panel (js/keys.js)
    'Teddy (left)': 'Teddy（左边）', 'Tommy (right)': 'Tommy（右边）',
    'hold to fly, let go to fall': '按住飞，松开往下掉', 'level 🐣 / 🔥': '难度 🐣 / 🔥', 'fly! · again': '起飞！· 再来',
    'Dodge the zappers and grab the coins all the way to the exit. Whoever has the most coins wins. In 1 player both sets of keys work and T calls your brother: he brings a treat and a shield that zappers bounce off. With 2 players, T is a high five.':
      '一路躲开电网、抓金币，飞到出口。金币最多的人赢。一个人玩时两套按键都能用，T 叫兄弟来：他会带来好吃的，还有一个电网电不到你的护盾。两个人玩时，T 是击掌。',
    "Hold anywhere to fly (with 2 players, Teddy holds the left half and Tommy the right). Tap your brother's face to call him.":
      '按住屏幕就能飞（两个人玩时，Teddy 按左边，Tommy 按右边）。点兄弟的头像叫他来。',
  });

  const TREAT = { 'ICE CREAM': '冰淇淋', WATER: '水', 'JUICE BOX': '果汁', COOKIE: '饼干', WATERMELON: '西瓜', BANANA: '香蕉' };
  L.rule(/^(TEDDY|TOMMY) · EASY$/, '$1 · 简单');
  L.rule(/^(TEDDY|TOMMY) · NORMAL$/, '$1 · 普通');
  L.rule(/^BEST 🪙 (\d+)$/, '最高分 🪙 $1');
  L.rule(/^(\d+) m$/, '$1 米');
  L.rule(/^COIN STREAK ×(\d+)!$/, '连抓 $1 个金币！');
  L.rule(/^⚡ (?:(\S+): )?BZZT!( ❤️ −1| −\d+ 🪙)?$/, (m, who, rest) => `⚡ ${who ? who + ' ' : ''}被电到啦！${rest || ''}`);
  L.rule(/^🫧 (\S+) IS OUT!$/, '🫧 $1 出局啦！');
  L.rule(/^(\S+) SAYS: SHIELD!$/, '$1 说：护盾！');
  L.rule(/^(\S+) (ICE CREAM|WATER|JUICE BOX|COOKIE|WATERMELON|BANANA) FROM (.+)!$/, (m, emoji, item, who) => `${emoji} ${who} 给你${TREAT[item]}！`);
  L.rule(/^🏆 (\S+) WINS!$/, '🏆 $1 赢啦！');
  L.rule(/^(🦊|🐸) (\S+) WINS!$/, '$1 $2 赢啦！');
  L.rule(/^(\S+)'S BEST$/, '$1 的最高分');
})();
