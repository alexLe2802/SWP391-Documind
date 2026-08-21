import { Global, Module } from '@nestjs/common';
import { firebaseAuthProvider } from './firebase-admin.providers';

@Global()
@Module({
  providers: [firebaseAuthProvider],
  exports: [firebaseAuthProvider],
})
export class FirebaseModule {}
