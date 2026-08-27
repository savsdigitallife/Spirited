import test from 'node:test';
import assert from 'node:assert/strict';

import { AREAS, areaList, validateWorld } from '../src/world/index.js';
import { SCRIPTS } from '../src/data/script.js';
import { CHAPTERS } from '../src/data/quests.js';
import { createState } from '../src/systems/state.js';
import { Dialogue } from '../src/systems/dialogue.js';
import { isSolidTile } from '../src/world/tiles.js';
import { tileAt } from '../src/world/mapbuilder.js';

test('every map is geometrically sound', () => {
  assert.deepEqual(validateWorld(), []);
});

test('the world spans Tokyo, the countryside and beyond', () => {
  const regions = new Set(areaList().map((a) => a.region));
  assert.deepEqual([...regions].sort(), ['country', 'spirit', 'tokyo']);
});

test('every script referenced by the world exists', () => {
  const missing = [];
  for (const area of areaList()) {
    for (const npc of area.npcs) if (!SCRIPTS[npc.script]) missing.push(`${area.id}/${npc.id}`);
    for (const prop of area.props) if (prop.script && !SCRIPTS[prop.script]) missing.push(`${area.id}/${prop.id}`);
    for (const trig of area.triggers) {
      for (const fx of trig.fx ?? []) {
        if (fx.type === 'cutscene' && !SCRIPTS[fx.id]) missing.push(`${area.id}/${trig.id}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('every script builds a runnable graph in every chapter', () => {
  for (const [id, build] of Object.entries(SCRIPTS)) {
    for (const ch of CHAPTERS) {
      const s = createState();
      s.chapter = ch.id;
      const graph = build(s);
      if (!graph) continue;
      assert.ok(graph.nodes, `${id} in ${ch.id} produced no nodes`);
      const d = new Dialogue(graph, s);
      // Walk the graph without choices to be sure nothing points at a missing node.
      for (let i = 0; i < 60 && !d.finished; i++) {
        if (d.choices()) break;
        d.advance();
      }
    }
  }
});

test('every area is reachable from the flat by walking or by story teleport', () => {
  // Portal edges plus the two teleports the story performs from dialogue.
  const edges = { railstop: ['marshhouse'], marshhouse: ['grove'], grove: ['market'] };
  for (const area of areaList()) {
    edges[area.id] = [...(edges[area.id] ?? []), ...area.portals.map((p) => p.to.area)];
  }
  const seen = new Set(['flat']);
  const queue = ['flat'];
  while (queue.length) {
    for (const next of edges[queue.shift()] ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  const unreachable = Object.keys(AREAS).filter((id) => !seen.has(id));
  assert.deepEqual(unreachable, []);
});

test('the player spawn point is standable', () => {
  const s = createState();
  const area = AREAS[s.player.area];
  const tile = tileAt(area, Math.floor(s.player.x / 32), Math.floor(s.player.y / 32));
  assert.equal(isSolidTile(tile), false);
});
