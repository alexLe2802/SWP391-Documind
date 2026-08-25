import 'package:firebase_auth/firebase_auth.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../core/api_client.dart';
import '../../core/firebase_options.dart';

final firebaseAuthProvider = Provider((_) => FirebaseAuth.instance);
final apiClientProvider = Provider(
  (ref) => ApiClient(ref.watch(firebaseAuthProvider)),
);
final authStateProvider = StreamProvider<User?>(
  (ref) => ref.watch(firebaseAuthProvider).authStateChanges(),
);

class AuthController {
  AuthController(this._auth, this._api);
  final FirebaseAuth _auth;
  final ApiClient _api;

  // Thực hiện chức năng sign in.
  Future<void> signIn(String email, String password) async {
    await _clearSession();
    try {
      final credential = await _auth.signInWithEmailAndPassword(
        email: email.trim(),
        password: password,
      );
      if (credential.user?.emailVerified != true) {
        throw StateError('Verify your email before signing in.');
      }
      await _api.post('/auth/firebase-login');
    } catch (_) {
      await _auth.signOut();
      rethrow;
    }
  }

  // Tạo hoặc lưu đăng ký.
  Future<void> register(String fullName, String email, String password) async {
    final credential = await _auth.createUserWithEmailAndPassword(
      email: email.trim(),
      password: password,
    );
    await credential.user?.updateDisplayName(fullName.trim());
    await _api.post(
      '/auth/register',
      data: {'fullName': fullName.trim(), 'acceptedTerms': true},
    );
    await credential.user?.sendEmailVerification();
    await _auth.signOut();
  }

  // Tạo hoặc lưu đăng ký google.
  Future<void> registerGoogle(
    String fullName,
    String email,
    String password,
  ) async {
    final user = _auth.currentUser;
    if (user == null) throw StateError('Google session expired');
    final hasPasswordProvider = user.providerData.any(
      (provider) => provider.providerId == 'password',
    );
    if (!hasPasswordProvider) {
      await user.linkWithCredential(
        EmailAuthProvider.credential(email: email.trim(), password: password),
      );
    } else {
      await user.updatePassword(password);
    }
    await user.updateDisplayName(fullName.trim());
    await user.getIdToken(true);
    await _api.post(
      '/auth/register',
      data: {'fullName': fullName.trim(), 'acceptedTerms': true},
    );
    await _auth.signOut();
  }

  // Thực hiện chức năng forgot password.
  Future<void> forgotPassword(String email) =>
      _api.post('/auth/forgot-password', data: {'email': email.trim()});

  // Thực hiện chức năng sign in with google.
  Future<GoogleRegistrationData?> signInWithGoogle() async {
    await _auth.signOut();
    final google = GoogleSignIn.instance;
    await google.initialize(
      clientId: kIsWeb && DocuMindFirebaseOptions.googleWebClientId.isNotEmpty
          ? DocuMindFirebaseOptions.googleWebClientId
          : null,
      serverClientId:
          !kIsWeb && DocuMindFirebaseOptions.googleServerClientId.isNotEmpty
          ? DocuMindFirebaseOptions.googleServerClientId
          : null,
    );
    try {
      await google.disconnect();
    } catch (_) {}
    final account = await google.authenticate();
    final idToken = account.authentication.idToken;
    if (idToken == null) throw StateError('Google did not return an ID token');
    final credential = await _auth.signInWithCredential(
      GoogleAuthProvider.credential(idToken: idToken),
    );
    try {
      final user = credential.user;
      if (user == null) {
        throw StateError('Google session expired');
      }
      await _api.post('/auth/firebase-login');
      return null;
    } on DioException catch (error) {
      final body = error.response?.data;
      final message = body is Map
          ? ((body['error'] is Map ? body['error']['message'] : body['message'])
                    ?.toString() ??
                '')
          : '';
      if (message.contains('Account registration is required')) {
        final registration = GoogleRegistrationData(
          fullName: account.displayName ?? '',
          email: account.email,
          googleIdToken: idToken,
        );
        return registration;
      }
      await _auth.signOut();
      rethrow;
    }
  }

  // Thực hiện chức năng sign out.
  Future<void> signOut() async {
    await _clearSession();
  }

  // Thực hiện chức năng clear phiên.
  Future<void> _clearSession() async {
    await _auth.signOut();
    try {
      await GoogleSignIn.instance.disconnect();
    } catch (_) {}
  }
}

class GoogleRegistrationData {
  const GoogleRegistrationData({
    required this.fullName,
    required this.email,
    this.googleIdToken,
  });
  final String fullName;
  final String email;
  final String? googleIdToken;
}

final authControllerProvider = Provider(
  (ref) => AuthController(
    ref.watch(firebaseAuthProvider),
    ref.watch(apiClientProvider),
  ),
);
