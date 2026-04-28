// User Service
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:logger/logger.dart';
import '../models/index.dart';
import 'firebase_service.dart';

class UserService {
  static final UserService _instance = UserService._internal();
  static final Logger logger = Logger();

  factory UserService() {
    return _instance;
  }

  UserService._internal();

  final FirebaseService _firebaseService = FirebaseService();

  // Get user by ID
  Future<User?> getUserById(String userId) async {
    try {
      final doc = await _firebaseService.usersCollection.doc(userId).get();
      
      if (!doc.exists || doc.data() == null) {
        return null;
      }

      return User.fromFirestore(doc.data() as Map<String, dynamic>, doc.id);
    } catch (e) {
      logger.e('Error getting user: $e');
      return null;
    }
  }

  // Get all team members
  Future<List<User>> getTeamMembers(String teamId) async {
    try {
      final query = await _firebaseService.usersCollection
          .where('teamId', isEqualTo: teamId)
          .get();

      return query.docs
          .map((doc) => User.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
          .toList();
    } catch (e) {
      logger.e('Error getting team members: $e');
      return [];
    }
  }

  // Get all users
  Future<List<User>> getAllUsers() async {
    try {
      final query = await _firebaseService.usersCollection.get();

      return query.docs
          .map((doc) => User.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
          .toList();
    } catch (e) {
      logger.e('Error getting all users: $e');
      return [];
    }
  }

  // Get active members in team
  Future<List<User>> getActiveTeamMembers(String teamId) async {
    try {
      final query = await _firebaseService.usersCollection
          .where('teamId', isEqualTo: teamId)
          .where('isActive', isEqualTo: true)
          .get();

      return query.docs
          .map((doc) => User.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
          .toList();
    } catch (e) {
      logger.e('Error getting active team members: $e');
      return [];
    }
  }

  // Set user active status
  Future<void> setUserActiveStatus(String userId, bool isActive) async {
    try {
      await _firebaseService.usersCollection.doc(userId).update({
        'isActive': isActive,
        'lastActiveAt': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      logger.e('Error updating user status: $e');
      rethrow;
    }
  }

  // Stream active members in team
  Stream<List<User>> streamActiveTeamMembers(String teamId) {
    try {
      return _firebaseService.usersCollection
          .where('teamId', isEqualTo: teamId)
          .where('isActive', isEqualTo: true)
          .snapshots()
          .map((snapshot) {
        return snapshot.docs
            .map((doc) => User.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
            .toList();
      });
    } catch (e) {
      logger.e('Error streaming active members: $e');
      return Stream.value([]);
    }
  }

  // Update user role (Captain only)
  Future<void> updateUserRole(String userId, UserRole role) async {
    try {
      await _firebaseService.usersCollection.doc(userId).update({
        'role': role.value,
      });
      logger.i('User role updated: $userId -> ${role.value}');
    } catch (e) {
      logger.e('Error updating user role: $e');
      rethrow;
    }
  }

  // Assign user to team
  Future<void> assignUserToTeam(String userId, String teamId) async {
    try {
      await _firebaseService.usersCollection.doc(userId).update({
        'teamId': teamId,
      });
      logger.i('User assigned to team: $userId -> $teamId');
    } catch (e) {
      logger.e('Error assigning user to team: $e');
      rethrow;
    }
  }

  // Remove user from team
  Future<void> removeUserFromTeam(String userId) async {
    try {
      await _firebaseService.usersCollection.doc(userId).update({
        'teamId': FieldValue.delete(),
      });
      logger.i('User removed from team: $userId');
    } catch (e) {
      logger.e('Error removing user from team: $e');
      rethrow;
    }
  }

  // Search users by name
  Future<List<User>> searchUsersByName(String query) async {
    try {
      final allUsers = await getAllUsers();
      return allUsers
          .where((user) => user.name.toLowerCase().contains(query.toLowerCase()))
          .toList();
    } catch (e) {
      logger.e('Error searching users: $e');
      return [];
    }
  }
}
