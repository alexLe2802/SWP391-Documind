import { GUARDS_METADATA } from '@nestjs/common/constants';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { ContentExtractionController } from './content-extraction.controller';

describe('ContentExtractionController', () => {
  it('protects the test endpoint with Firebase authentication', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      ContentExtractionController,
    ) as unknown;

    expect(guards).toEqual(expect.arrayContaining([FirebaseAuthGuard]));
  });
});
