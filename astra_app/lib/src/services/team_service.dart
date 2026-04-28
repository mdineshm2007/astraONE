// Team Service
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:logger/logger.dart';
import '../models/index.dart';
import 'firebase_service.dart';

class TeamService {
  static final TeamService _instance = TeamService._internal();
  static final Logger logger = Logger();

  factory TeamService() {
    return _instance;
  }

  TeamService._internal();

  final FirebaseService _firebaseService = FirebaseService();

  // Get team by ID
  Future<Team?> getTeamById(String teamId) async {
    try {
      final doc = await _firebaseService.teamsCollection.doc(teamId).get();
      
      if (!doc.exists || doc.data() == null) {
        return null;
      }

      return Team.fromFirestore(doc.data() as Map<String, dynamic>, doc.id);
    } catch (e) {
      logger.e('Error getting team: $e');
      return null;
    }
  }

  // Get all teams
  Future<List<Team>> getAllTeams() async {
    try {
      final query = await _firebaseService.teamsCollection
          .where('isActive', isEqualTo: true)
          .get();

      return query.docs
          .map((doc) => Team.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
          .toList();
    } catch (e) {
      logger.e('Error getting all teams: $e');
      return [];
    }
  }

  // Create team
  Future<Team?> createTeam({
    required String name,
    required String description,
    required String leadId,
    required List<String> memberIds,
  }) async {
    try {
      final teamRef = _firebaseService.teamsCollection.doc();
      final team = Team(
        id: teamRef.id,
        name: name,
        description: description,
        memberIds: memberIds,
        leadId: leadId,
        createdAt: DateTime.now(),
        isActive: true,
      );

      await teamRef.set(team.toFirestore());
      logger.i('Team created: ${teamRef.id}');
      return team;
    } catch (e) {
      logger.e('Error creating team: $e');
      return null;
    }
  }

  // Update team
  Future<void> updateTeam(Team team) async {
    try {
      await _firebaseService.teamsCollection.doc(team.id).update(team.toFirestore());
      logger.i('Team updated: ${team.id}');
    } catch (e) {
      logger.e('Error updating team: $e');
      rethrow;
    }
  }

  // Add member to team
  Future<void> addMemberToTeam(String teamId, String memberId) async {
    try {
      await _firebaseService.teamsCollection.doc(teamId).update({
        'memberIds': FieldValue.arrayUnion([memberId]),
      });
      logger.i('Member added to team: $teamId <- $memberId');
    } catch (e) {
      logger.e('Error adding member to team: $e');
      rethrow;
    }
  }

  // Remove member from team
  Future<void> removeMemberFromTeam(String teamId, String memberId) async {
    try {
      await _firebaseService.teamsCollection.doc(teamId).update({
        'memberIds': FieldValue.arrayRemove([memberId]),
      });
      logger.i('Member removed from team: $teamId <- $memberId');
    } catch (e) {
      logger.e('Error removing member from team: $e');
      rethrow;
    }
  }

  // Update team lead
  Future<void> updateTeamLead(String teamId, String newLeadId) async {
    try {
      await _firebaseService.teamsCollection.doc(teamId).update({
        'leadId': newLeadId,
      });
      logger.i('Team lead updated: $teamId -> $newLeadId');
    } catch (e) {
      logger.e('Error updating team lead: $e');
      rethrow;
    }
  }

  // Stream teams
  Stream<List<Team>> streamAllTeams() {
    try {
      return _firebaseService.teamsCollection
          .where('isActive', isEqualTo: true)
          .snapshots()
          .map((snapshot) {
        return snapshot.docs
            .map((doc) => Team.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
            .toList();
      });
    } catch (e) {
      logger.e('Error streaming teams: $e');
      return Stream.value([]);
    }
  }

  // Get teams for user
  Future<List<Team>> getTeamsForUser(String userId, UserRole role) async {
    try {
      if (role == UserRole.CAPTAIN) {
        return await getAllTeams();
      } else {
        // For team leads and members, get their assigned team
        final query = await _firebaseService.teamsCollection
            .where('memberIds', arrayContains: userId)
            .get();
        
        return query.docs
            .map((doc) => Team.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
            .toList();
      }
    } catch (e) {
      logger.e('Error getting teams for user: $e');
      return [];
    }
  }
}
