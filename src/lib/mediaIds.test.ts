import { collectMediaIds } from './mediaIds';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';

describe('collectMediaIds', () => {
  it('finds media ids under every naming the content uses, at any depth', () => {
    const ids = collectMediaIds({
      mediaIds: [A],
      paragraphs: [{ image: { mediaId: B } }],
      items: [{ pronunciationAudioMediaId: C, examples: [{ audioMediaId: null }] }],
      content: { audio: { assetId: D }, media_id: A },
    });
    expect([...ids].sort()).toEqual([A, B, C, D].sort());
  });

  it('takes nothing that is not an id under a media field', () => {
    expect(
      collectMediaIds({ id: A, title: B, mediaId: 'not-an-id', exerciseId: C }).size,
    ).toBe(0);
  });
});
