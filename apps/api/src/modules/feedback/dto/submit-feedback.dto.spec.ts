import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SubmitFeedbackDto } from './submit-feedback.dto';

async function validateDto(plain: object) {
  const dto = plainToInstance(SubmitFeedbackDto, plain);
  return validate(dto);
}

describe('SubmitFeedbackDto', () => {
  // -------------------------------------------------------------------------
  // Valid cases
  // -------------------------------------------------------------------------

  it('accepts rating=1 (positive)', async () => {
    const errors = await validateDto({
      message_id: 'msg-abc',
      session_id: 'sess-xyz',
      rating: 1,
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts rating=-1 (negative)', async () => {
    const errors = await validateDto({
      message_id: 'msg-abc',
      session_id: 'sess-xyz',
      rating: -1,
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts optional note when provided', async () => {
    const errors = await validateDto({
      message_id: 'msg-abc',
      session_id: 'sess-xyz',
      rating: -1,
      note: 'Câu trả lời sai',
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts dto without note (note is optional)', async () => {
    const errors = await validateDto({
      message_id: 'msg-abc',
      session_id: 'sess-xyz',
      rating: 1,
    });
    expect(errors).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Invalid rating values
  // -------------------------------------------------------------------------

  it('rejects rating=0 (not allowed)', async () => {
    const errors = await validateDto({
      message_id: 'msg-abc',
      session_id: 'sess-xyz',
      rating: 0,
    });
    expect(errors.length).toBeGreaterThan(0);
    const ratingError = errors.find((e) => e.property === 'rating');
    expect(ratingError).toBeDefined();
  });

  it('rejects rating=2 (out of range)', async () => {
    const errors = await validateDto({
      message_id: 'msg-abc',
      session_id: 'sess-xyz',
      rating: 2,
    });
    const ratingError = errors.find((e) => e.property === 'rating');
    expect(ratingError).toBeDefined();
  });

  it('rejects rating as string "1"', async () => {
    const errors = await validateDto({
      message_id: 'msg-abc',
      session_id: 'sess-xyz',
      rating: '1',
    });
    const ratingError = errors.find((e) => e.property === 'rating');
    expect(ratingError).toBeDefined();
  });

  it('rejects missing rating', async () => {
    const errors = await validateDto({
      message_id: 'msg-abc',
      session_id: 'sess-xyz',
    });
    const ratingError = errors.find((e) => e.property === 'rating');
    expect(ratingError).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Required fields
  // -------------------------------------------------------------------------

  it('rejects missing message_id', async () => {
    const errors = await validateDto({ session_id: 'sess-xyz', rating: 1 });
    const err = errors.find((e) => e.property === 'message_id');
    expect(err).toBeDefined();
  });

  it('rejects missing session_id', async () => {
    const errors = await validateDto({ message_id: 'msg-abc', rating: 1 });
    const err = errors.find((e) => e.property === 'session_id');
    expect(err).toBeDefined();
  });

  it('rejects non-string message_id', async () => {
    const errors = await validateDto({
      message_id: 123,
      session_id: 'sess-xyz',
      rating: 1,
    });
    const err = errors.find((e) => e.property === 'message_id');
    expect(err).toBeDefined();
  });

  it('rejects non-string session_id', async () => {
    const errors = await validateDto({
      message_id: 'msg-abc',
      session_id: 456,
      rating: 1,
    });
    const err = errors.find((e) => e.property === 'session_id');
    expect(err).toBeDefined();
  });

  it('rejects non-string note', async () => {
    const errors = await validateDto({
      message_id: 'msg-abc',
      session_id: 'sess-xyz',
      rating: 1,
      note: 999,
    });
    const err = errors.find((e) => e.property === 'note');
    expect(err).toBeDefined();
  });

  it('rejects completely empty object', async () => {
    const errors = await validateDto({});
    expect(errors.length).toBeGreaterThanOrEqual(3); // message_id, session_id, rating
  });
});
