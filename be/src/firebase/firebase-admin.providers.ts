import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { FIREBASE_AUTH } from './firebase.constants';

// Thực hiện chức năng firebase app factory.
function firebaseAppFactory(configService: ConfigService): App {
  const existingApp = getApps()[0];
  if (existingApp) {
    return existingApp;
  }

  const projectId = configService.getOrThrow<string>('FIREBASE_PROJECT_ID');
  const clientEmail = configService.getOrThrow<string>('FIREBASE_CLIENT_EMAIL');
  const privateKey = configService
    .getOrThrow<string>('FIREBASE_PRIVATE_KEY')
    .replace(/\\n/g, '\n');

  try {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }

    console.warn(
      'Firebase Admin credential parsing failed. Falling back to app initialization without cert in non-production.',
    );

    return initializeApp({
      projectId,
    });
  }
}

export const firebaseAuthProvider: Provider<Auth> = {
  provide: FIREBASE_AUTH,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) =>
    getAuth(firebaseAppFactory(configService)),
};
