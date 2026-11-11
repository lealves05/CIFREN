// Chamadas à central: a mesma chamada (método, rota e corpo) nunca sai duas vezes com o mesmo segundo assinado —
// a central recusaria a segunda como repetição ("Chamada da plataforma não autenticada").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signSecond } from '../src/platform.js';

test('mesma chamada simultânea assina em segundos diferentes; chamadas diferentes não esperam', async () => {
  const key = `GET /tenants/x/billing ${Math.random()}`;
  const [a, b] = await Promise.all([signSecond(key), signSecond(key)]);
  assert.notEqual(a, b);
  const t0 = Date.now();
  const [c, d] = await Promise.all([signSecond(`${key}-1`), signSecond(`${key}-2`)]);
  assert.ok(Math.abs(c - d) <= 1 && Date.now() - t0 < 900);
});
