// Authentication Service
import 'package:firebase_auth/firebase_auth.dart' as auth;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:logger/logger.dart';
import '../models/index.dart';
import 'firebase_service.dart';

class AuthService {
  static final AuthService _instance = AuthService._internal();
  static final Logger logger = Logger();

  factory AuthService() {
    return _instance;
  }

  AuthService._internal();

  final FirebaseService _firebaseService = FirebaseService();
  auth.User? _currentUser;

  auth.User? get currentUser => _currentUser;
  bool get isAuthenticated => _currentUser != null;

  // Get current user's Firestore data
  Future<User?> getCurrentUserData() async {
    try {
      _currentUser = _firebaseService.firebaseAuth.currentUser;
      
      if (_currentUser == null) {
        return null;
      }

      final doc = await _firebaseService.usersCollection.doc(_currentUser!.uid).get();
      
      if (doc.exists) {
        return User.fromFirestore(doc.data() as Map<String, dynamic>, doc.id);
      }
      return null;
    } catch (e) {
      logger.e('Error getting current user data: $e');
      return null;
    }
  }

  // Register new user
  Future<User?> register({
    required String email,
    required String password,
    required String name,
    required UserRole role,
    String? teamId,
  }) async {
    try {
      final result = await _firebaseService.firebaseAuth.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );

      _currentUser = result.user;

      if (_currentUser != null) {
        final user = User(
          id: _currentUser!.uid,
          email: email,
          name: name,
          role: role,
          teamId: teamId,
          isActive: true,
          createdAt: DateTime.now(),
          lastActiveAt: DateTime.now(),
        );

        await _firebaseService.usersCollection.doc(_currentUser!.uid).set(user.toFirestore());
        logger.i('User registered successfully: ${_currentUser!.uid}');
        return user;
      }
      return null;
    } on auth.FirebaseAuthException catch (e) {
      logger.e('Registration error: ${e.message}');
      throw _handleAuthException(e);
    } catch (e) {
      logger.e('Unexpected registration error: $e');
      rethrow;
    }
  }

  // Login user
  Future<User?> login({
    required String email,
    required String password,
  }) async {
    try {
      final result = await _firebaseService.firebaseAuth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );

      _currentUser = result.user;

      if (_currentUser != null) {
        // Update last active time
        await _firebaseService.usersCollection.doc(_currentUser!.uid).update({
          'isActive': true,
          'lastActiveAt': DateTime.now().toIso8601String(),
        });

        return await getCurrentUserData();
      }
      return null;
    } on auth.FirebaseAuthException catch (e) {
      logger.e('Login error: ${e.message}');
      throw _handleAuthException(e);
    } catch (e) {
      logger.e('Unexpected login error: $e');
      rethrow;
    }
  }

  // Logout user
  Future<void> logout() async {
    try {
      if (_currentUser != null) {
        await _firebaseService.usersCollection.doc(_currentUser!.uid).update({
          'isActive': false,
          'lastActiveAt': DateTime.now().toIso8601String(),
        });
      }
      
      await _firebaseService.firebaseAuth.signOut();
      _currentUser = null;
      logger.i('User logged out successfully');
    } catch (e) {
      logger.e('Logout error: $e');
      rethrow;
    }
  }

  // Session persistence
  Future<User?> checkSession() async {
    try {
      _currentUser = _firebaseService.firebaseAuth.currentUser;
      
      if (_currentUser != null) {
        return await getCurrentUserData();
      }
      return null;
    } catch (e) {
      logger.e('Session check error: $e');
      return null;
    }
  }

  // Update user profile
  Future<void> updateUserProfile({
    required String userId,
    String? name,
    String? teamId,
  }) async {
    try {
      final updates = <String, dynamic>{};
      if (name != null) updates['name'] = name;
      if (teamId != null) updates['teamId'] = teamId;

      if (updates.isNotEmpty) {
        await _firebaseService.usersCollection.doc(userId).update(updates);
        logger.i('User profile updated: $userId');
      }
    } catch (e) {
      logger.e('Profile update error: $e');
      rethrow;
    }
  }

  // Handle auth exceptions
  String _handleAuthException(auth.FirebaseAuthException e) {
    switch (e.code) {
      case 'weak-password':
        return 'The password provided is too weak.';
      case 'email-already-in-use':
        return 'An account already exists for that email.';
      case 'invalid-email':
        return 'The email address is not valid.';
      case 'user-disabled':
        return 'The user account has been disabled.';
      case 'user-not-found':
        return 'No account found with that email.';
      case 'wrong-password':
        return 'The password is incorrect.';
      default:
        return 'Authentication failed. Please try again.';
    }
  }
}
