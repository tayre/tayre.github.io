const test = require('node:test');
const assert = require('node:assert/strict');
test('vessel profiles only accept an exact MMSI', async () => {
  const { vesselProfileUrl } = await import('../vessel-card.mjs');
  assert.equal(vesselProfileUrl({ mmsi: 258465000 }), 'https://www.marinetraffic.com/en/ais/details/ships/mmsi:258465000');
  assert.equal(vesselProfileUrl({ mmsi: '123<script>' }), null);
});
test('photos match IMO and use attributed Wikimedia thumbnails; successful results are cached', async () => {
  const { loadVesselPhoto } = await import('../vessel-card.mjs');
  let calls = 0;
  const fetcher = async url => {
    calls++;
    if (calls === 1) {
      assert.match(new URL(url).searchParams.get('query'), /P458 "9233258"/);
      return { ok: true, json: async () => ({ results: { bindings: [{ image: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/Ship.jpg' } }] } }) };
    }
    assert.equal(new URL(url).searchParams.get('titles'), 'File:Ship.jpg');
    return { ok: true, json: async () => ({ query: { pages: { 1: { imageinfo: [{ thumburl: 'https://thumb.wikimedia.org/photo.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Ship.jpg', extmetadata: { Artist: { value: 'Photographer' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] } } } }) };
  };
  const photo = await loadVesselPhoto({ imo: 9233258 }, { fetcher });
  assert.equal(photo.artist, 'Photographer');
  assert.equal(photo.src, 'https://thumb.wikimedia.org/photo.jpg');
  assert.equal(await loadVesselPhoto({ imo: 9233258 }, { fetcher }), photo);
  assert.equal(calls, 2);
});
test('missing matches and failed sources do not invent a photo', async () => {
  const { loadVesselPhoto } = await import('../vessel-card.mjs');
  const fetcher = async url => {
    assert.match(new URL(url).searchParams.get('query'), /P587 "257000001"/);
    return { ok: true, json: async () => ({ results: { bindings: [] } }) };
  };
  assert.equal(await loadVesselPhoto({ mmsi: 257000001 }, { fetcher }), null);
  await assert.rejects(loadVesselPhoto({ mmsi: 257000002 }, { fetcher: async () => ({ ok: false }) }), /unavailable/);
});
