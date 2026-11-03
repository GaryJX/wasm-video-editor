// Unit tests for formatTime (the JS mirror of the drawtext timer expressions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime } from '../src/buildArgs.js';

const cases = {
  'mm:ss': [[0, '00:00'], [9.99, '00:09'], [61.5, '01:01'], [3599.9, '59:59'], [3600, '60:00']],
  'hh:mm:ss': [[0, '00:00:00'], [59.9, '00:00:59'], [3661, '01:01:01'], [86399, '23:59:59']],
  'mm:ss.cc': [[0, '00:00.00'], [1.25, '00:01.25'], [61.999, '01:01.99'], [125.5, '02:05.50']],
  seconds: [[0, '0s'], [0.99, '0s'], [12.7, '12s'], [3600, '3600s']],
};

for (const [format, rows] of Object.entries(cases)) {
  for (const [t, expected] of rows) {
    test(`formatTime_${format}_${t}s_returns_${expected}`, () => {
      // Arrange/Act
      const actual = formatTime(t, format);
      // Assert
      assert.equal(actual, expected);
    });
  }
}

test('formatTime_unknownFormat_returnsUndefined', () => {
  assert.equal(formatTime(10, 'bogus'), undefined);
});

// Parity: the preview text must equal what ffmpeg's drawtext will render.
// Tiny evaluator for the %{eif\:EXPR\:d[\:W]} expansions used by TIMER_FORMATS.
import { TIMER_FORMATS } from '../src/buildArgs.js';
function renderDrawtext(text, t) {
  return text
    .replace(/%\{eif\\:(.+?)\\:d(?:\\:(\d+))?\}/g, (_, expr, width) => {
      const js = expr.replaceAll('\\,', ',').replace(/mod\(/g, '__mod(').replace(/floor\(/g, 'Math.floor(');
      const v = Math.trunc(new Function('t', '__mod', `return ${js}`)(t, (a, b) => a % b));
      return width ? String(v).padStart(+width, '0') : String(v);
    })
    .replaceAll('\\:', ':');
}

for (const format of Object.keys(TIMER_FORMATS)) {
  for (const t of [0, 0.5, 9.99, 59.99, 61.25, 3599.5, 3725.07]) {
    test(`formatTime_${format}_${t}s_matchesDrawtextOutput`, () => {
      // Arrange
      const expected = renderDrawtext(TIMER_FORMATS[format](), t);
      // Act
      const actual = formatTime(t, format);
      // Assert
      assert.equal(actual, expected);
    });
  }
}
