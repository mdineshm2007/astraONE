// Query Service
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:logger/logger.dart';
import '../models/index.dart';
import 'firebase_service.dart';

class QueryService {
  static final QueryService _instance = QueryService._internal();
  static final Logger logger = Logger();

  factory QueryService() {
    return _instance;
  }

  QueryService._internal();

  final FirebaseService _firebaseService = FirebaseService();

  // Submit query (all users)
  Future<Query?> submitQuery({
    required String senderId,
    required String senderName,
    required String content,
    String? attachmentUrl,
  }) async {
    try {
      final queryRef = _firebaseService.queriesCollection.doc();
      final query = Query(
        id: queryRef.id,
        senderId: senderId,
        senderName: senderName,
        content: content,
        attachmentUrl: attachmentUrl,
        status: QueryStatus.OPEN,
        timestamp: DateTime.now(),
      );

      await queryRef.set(query.toFirestore());
      logger.i('Query submitted: ${queryRef.id}');
      return query;
    } catch (e) {
      logger.e('Error submitting query: $e');
      return null;
    }
  }

  // Get all queries (Captain only)
  Future<List<Query>> getAllQueries() async {
    try {
      final querySnap = await _firebaseService.queriesCollection
          .orderBy('timestamp', descending: true)
          .get();

      return querySnap.docs
          .map((doc) => Query.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
          .toList();
    } catch (e) {
      logger.e('Error getting all queries: $e');
      return [];
    }
  }

  // Get open queries (Captain only)
  Future<List<Query>> getOpenQueries() async {
    try {
      final querySnap = await _firebaseService.queriesCollection
          .where('status', isEqualTo: 'OPEN')
          .orderBy('timestamp', descending: true)
          .get();

      return querySnap.docs
          .map((doc) => Query.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
          .toList();
    } catch (e) {
      logger.e('Error getting open queries: $e');
      return [];
    }
  }

  // Respond to query (Captain only)
  Future<void> respondToQuery(String queryId, String response) async {
    try {
      await _firebaseService.queriesCollection.doc(queryId).update({
        'response': response,
        'status': 'RESOLVED',
        'resolvedAt': DateTime.now().toIso8601String(),
      });
      logger.i('Query response added: $queryId');
    } catch (e) {
      logger.e('Error responding to query: $e');
      rethrow;
    }
  }

  // Stream all queries (Captain only)
  Stream<List<Query>> streamAllQueries() {
    try {
      return _firebaseService.queriesCollection
          .orderBy('timestamp', descending: true)
          .snapshots()
          .map((snapshot) {
        return snapshot.docs
            .map((doc) => Query.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
            .toList();
      });
    } catch (e) {
      logger.e('Error streaming queries: $e');
      return Stream.value([]);
    }
  }

  // Get query by ID (Captain only)
  Future<Query?> getQueryById(String queryId) async {
    try {
      final doc = await _firebaseService.queriesCollection.doc(queryId).get();
      
      if (!doc.exists || doc.data() == null) {
        return null;
      }

      return Query.fromFirestore(doc.data() as Map<String, dynamic>, doc.id);
    } catch (e) {
      logger.e('Error getting query: $e');
      return null;
    }
  }
}
