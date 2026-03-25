/**
 * Emoji rotation system for email sections.
 * Prevents duplicate emojis in adjacent rows.
 */

const SECTION_EMOJIS = {
  hot:     ['🔥', '⚡', '💥', '🌟'],
  danger:  ['🚨', '⚠️', '❗', '🔴'],
  data:    ['📊', '📈', '📉', '🎯'],
  money:   ['💰', '💵', '🏦', '💎'],
  trophy:  ['🏆', '👑', '🥇', '🎖️'],
  ball:    ['🏀', '🏟️', '🎯', '🔵'],
  news:    ['📰', '📣', '📢', '🗞️'],
};

/**
 * Create an emoji picker that avoids repeats.
 * Usage:
 *   const emoji = createEmojiPicker('hot');
 *   emoji.next() → '🔥'
 *   emoji.next() → '⚡' (won't repeat '🔥')
 */
export function createEmojiPicker(category = 'data') {
  const pool = SECTION_EMOJIS[category] || SECTION_EMOJIS.data;
  let index = 0;
  return {
    next() {
      const e = pool[index % pool.length];
      index++;
      return e;
    },
    peek() {
      return pool[index % pool.length];
    },
  };
}

/**
 * Pick an emoji from a category, offset by row index to avoid adjacent duplicates.
 */
export function emojiForRow(category, rowIndex) {
  const pool = SECTION_EMOJIS[category] || SECTION_EMOJIS.data;
  return pool[rowIndex % pool.length];
}
