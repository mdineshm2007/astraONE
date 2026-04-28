// Firebase Service - Core Firebase initialization and configuration
import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as auth;
import 'package:logger/logger.dart';

class FirebaseService {
  static final FirebaseService _instance = FirebaseService._internal();
  static final Logger logger = Logger();

  factory FirebaseService() {
    return _instance;
  }

  FirebaseService._internal();

  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final auth.FirebaseAuth _firebaseAuth = auth.FirebaseAuth.instance;

  FirebaseFirestore get firestore => _firestore;
  auth.FirebaseAuth get firebaseAuth => _firebaseAuth;

  Future<void> initialize() async {
    try {
      await Firebase.initializeApp();
      logger.i('Firebase initialized successfully');
      
      // Enable offline persistence
      await _firestore.enableNetwork();
    } catch (e) {
      logger.e('Firebase initialization error: $e');
      rethrow;
    }
  }

  // Firestore collection references
  CollectionReference get usersCollection => _firestore.collection('users');
  CollectionReference get teamsCollection => _firestore.collection('teams');
  CollectionReference get tasksCollection => _firestore.collection('tasks');
  CollectionReference get taskUpdatesCollection => _firestore.collection('task_updates');
  CollectionReference get postsCollection => _firestore.collection('posts');
  CollectionReference get queriesCollection => _firestore.collection('queries');
  CollectionReference get activityLogsCollection => _firestore.collection('activity_logs');

  // Utility method to handle Firestore errors
  String getErrorMessage(dynamic error) {
    if (error is FirebaseException) {
      return error.message ?? 'Firebase error occurred';
    }
    return error.toString();
  }

  // Batch write operations
  WriteBatch createBatch() {
    return _firestore.batch();
  }

  // Transaction support
  Future<T> runTransaction<T>(
    Future<T> Function(Transaction) transactionHandler,
  ) async {
    try {
      return await _firestore.runTransaction(transactionHandler);
    } catch (e) {
      logger.e('Transaction error: $e');
      rethrow;
    }
  }
}
