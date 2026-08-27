// The 3D world is built from pure functions, so the geometry can be checked
// without a browser: no NaNs, no empty areas, nothing floating off the map.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAreaMesh } from '../src/render3d/areamesh.js';
import { VERTEX_FLOATS, Geo } from '../src/render3d/geometry.js';
import { TILE3D, groundAt, isBlock, blockHeight } from '../src/render3d/materials3d.js';
import { MATERIAL, MATERIAL_NAMES } from '../src/render3d/textures.js';
import { areaList, getArea } from '../src/world/index.js';
import { TILES, T } from '../src/world/tiles.js';

test('every tile type knows how to become 3D', () => {
  const missing = TILES.filter((tile) => {
    const def = TILE3D[tile.id];
    return !def || (!def.floor && !def.water && def.block === undefined);
  });
  assert.deepEqual(missing.map((t) => t.name), []);
});

test('every material a tile asks for actually exists', () => {
  const unknown = [];
  for (const def of TILE3D) {
    if (!def) continue;
    for (const key of ['floor', 'water', 'side', 'top']) {
      if (def[key] && MATERIAL[def[key]] === undefined) unknown.push(`${def.name}.${key}=${def[key]}`);
    }
  }
  assert.deepEqual(unknown, []);
  assert.ok(MATERIAL_NAMES.length > 20, 'the atlas should carry a real set of materials');
});

test('solid tiles stand up and water sits below the bank', () => {
  assert.ok(isBlock(T.facade) && blockHeight(T.facade) > blockHeight(T.counter));
  assert.equal(isBlock(T.grass), false);
  assert.ok(groundAt(T.water) < 0);
  assert.ok(groundAt(T.platform) > 0, 'a station platform is a step up');
});

test('every area builds finite, non-empty geometry', () => {
  for (const area of areaList()) {
    const { solid } = buildAreaMesh(area);
    assert.ok(solid.triangles > 0, `${area.id} produced no geometry`);
    assert.equal(solid.data.length % VERTEX_FLOATS, 0, `${area.id} vertex stride is wrong`);
    assert.equal(solid.data.length / VERTEX_FLOATS, solid.vertices);

    for (let i = 0; i < solid.data.length; i++) {
      if (!Number.isFinite(solid.data[i])) assert.fail(`${area.id} emitted a non-finite vertex value`);
    }
    for (let i = 0; i < solid.indices.length; i++) {
      assert.ok(solid.indices[i] < solid.vertices, `${area.id} has an index past the end of the buffer`);
    }
  }
});

test('geometry stays inside the map, give or take the surrounding cliff', () => {
  const area = getArea('paddyroad');
  const { solid } = buildAreaMesh(area);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < solid.data.length; i += VERTEX_FLOATS) {
    minX = Math.min(minX, solid.data[i]);
    maxX = Math.max(maxX, solid.data[i]);
    minY = Math.min(minY, solid.data[i + 1]);
    maxY = Math.max(maxY, solid.data[i + 1]);
  }
  assert.ok(minX >= -2 && maxX <= area.w + 2, 'geometry should not sprawl past the edge wall');
  assert.ok(minY >= -8, 'nothing should drop below the skirt');
  assert.ok(maxY < 20, 'nothing should tower absurdly over the valley');
});

test('the mesh builder is deterministic — a revisited area looks the same', () => {
  const a = buildAreaMesh(getArea('grove'));
  const b = buildAreaMesh(getArea('grove'));
  assert.equal(a.solid.vertices, b.solid.vertices);
  assert.deepEqual(a.solid.data.slice(0, 500), b.solid.data.slice(0, 500));
});

test('a box emits the faces it is asked for and no others', () => {
  const all = new Geo();
  all.box(0, 0, 0, 1, 1, 1, { top: 0, side: 0 });
  assert.equal(all.triangles ?? all.finish().triangles, 12);

  const topOnly = new Geo();
  topOnly.box(0, 0, 0, 1, 1, 1, { top: 0, side: 0 }, { faces: 0b000001 });
  assert.equal(topOnly.finish().triangles, 2);
});
