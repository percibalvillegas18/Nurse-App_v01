/**
 * Nursing DTO validation - unit tests for the class-validator decorators
 * enforced by the global ValidationPipe (phone + nationality allow-list).
 */
import { validate } from 'class-validator';
import { CreateNurseDto, UpdateNurseDto } from './nursing.dto';

const validCreate = {
  job_no: 'JOB-9001',
  first_name: 'Test',
  last_name: 'Nurse',
};

const makeCreate = (overrides: Record<string, any> = {}) =>
  Object.assign(new CreateNurseDto(), { ...validCreate, ...overrides });

describe('Nursing DTO validation', () => {
  describe('nationality', () => {
    it.each(['Philippines', 'Saudi', 'India'])('accepts "%s"', async (nationality) => {
      const errors = await validate(makeCreate({ nationality }));
      expect(errors.filter((e) => e.property === 'nationality')).toHaveLength(0);
    });

    it('rejects a nationality not in the supported list (create)', async () => {
      const errors = await validate(makeCreate({ nationality: 'Atlantis' }));
      expect(errors.find((e) => e.property === 'nationality')).toBeDefined();
    });

    it('rejects a nationality not in the supported list (update)', async () => {
      const errors = await validate(
        Object.assign(new UpdateNurseDto(), { nationality: 'Atlantis' }),
      );
      expect(errors.find((e) => e.property === 'nationality')).toBeDefined();
    });
  });

  describe('phone', () => {
    it.each(['+966-50-111-2233', '0551234567', '+1 (415) 555-2671', ''])(
      'accepts "%s"',
      async (phone) => {
        const errors = await validate(makeCreate({ phone }));
        expect(errors.filter((e) => e.property === 'phone')).toHaveLength(0);
      },
    );

    it.each(['abc', '12-34', '++9665'])('rejects "%s"', async (phone) => {
      const errors = await validate(makeCreate({ phone }));
      expect(errors.find((e) => e.property === 'phone')).toBeDefined();
    });

    it('rejects a malformed phone (update)', async () => {
      const errors = await validate(
        Object.assign(new UpdateNurseDto(), { phone: 'not-a-phone' }),
      );
      expect(errors.find((e) => e.property === 'phone')).toBeDefined();
    });
  });
});
