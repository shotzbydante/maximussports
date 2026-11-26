import { describe, it, expect } from 'vitest';
import { readLines } from './askClient.js';

async function* chunks(list) { for (const c of list) yield c; }
const collect = async (list) => { const out = []; for await (const e of readLines(chunks(list))) out.push(e); return out; };

describe('readLines', () => {
  it('parses one event per line', async () => {
    expect(await collect(['{"type":"status","label":"Pulling the board"}\n{"type":"text","delta":"No bet."}\n']))
      .toEqual([{ type: 'status', label: 'Pulling the board' }, { type: 'text', delta: 'No bet.' }]);
  });

  it('joins an event split across chunks and reads a last line with no newline', async () => {
    expect(await collect(['{"type":"te', 'xt","delta":"LV +3.5"}\n{"type":"done"', '}']))
      .toEqual([{ type: 'text', delta: 'LV +3.5' }, { type: 'done' }]);
  });

  it('skips blank and broken lines instead of failing the stream', async () => {
    expect(await collect(['\n{oops\n{"type":"done"}\n'])).toEqual([{ type: 'done' }]);
  });
});
