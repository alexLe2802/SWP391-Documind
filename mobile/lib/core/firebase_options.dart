import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

abstract final class DocuMindFirebaseOptions {
  static const _apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const _androidApiKey = String.fromEnvironment(
    'FIREBASE_ANDROID_API_KEY',
  );
  static const _iosAppId = String.fromEnvironment('FIREBASE_IOS_APP_ID');
  static const _androidAppId = String.fromEnvironment(
    'FIREBASE_ANDROID_APP_ID',
  );
  static const _webAppId = String.fromEnvironment('FIREBASE_WEB_APP_ID');
  static const _authDomain = String.fromEnvironment('FIREBASE_AUTH_DOMAIN');
  static const _messagingSenderId = String.fromEnvironment(
    'FIREBASE_MESSAGING_SENDER_ID',
  );
  static const _projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const _storageBucket = String.fromEnvironment(
    'FIREBASE_STORAGE_BUCKET',
  );
  static const _iosBundleId = String.fromEnvironment(
    'FIREBASE_IOS_BUNDLE_ID',
    defaultValue: 'icu.documind.mobile',
  );

  static const googleServerClientId = String.fromEnvironment(
    'GOOGLE_SERVER_CLIENT_ID',
  );
  static const googleWebClientId = String.fromEnvironment(
    'GOOGLE_WEB_CLIENT_ID',
  );

  static FirebaseOptions get currentPlatform {
    final appId = kIsWeb
        ? _webAppId
        : switch (defaultTargetPlatform) {
            TargetPlatform.android => _androidAppId,
            TargetPlatform.iOS => _iosAppId,
            _ => '',
          };
    final apiKey = !kIsWeb && defaultTargetPlatform == TargetPlatform.android
        ? _androidApiKey
        : _apiKey;
    if (apiKey.isEmpty || appId.isEmpty || _projectId.isEmpty) {
      throw StateError(
        'Missing Firebase configuration. Run with the dart-defines documented in mobile/README.md.',
      );
    }
    return FirebaseOptions(
      apiKey: apiKey,
      appId: appId,
      messagingSenderId: _messagingSenderId,
      projectId: _projectId,
      storageBucket: _storageBucket,
      authDomain: kIsWeb ? _authDomain : null,
      iosBundleId: defaultTargetPlatform == TargetPlatform.iOS
          ? _iosBundleId
          : null,
    );
  }
}
