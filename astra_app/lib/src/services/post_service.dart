// Post Service
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:logger/logger.dart';
import '../models/index.dart';
import 'firebase_service.dart';

class PostService {
  static final PostService _instance = PostService._internal();
  static final Logger logger = Logger();

  factory PostService() {
    return _instance;
  }

  PostService._internal();

  final FirebaseService _firebaseService = FirebaseService();

  // Create post
  Future<Post?> createPost({
    required String authorId,
    required String authorName,
    required UserRole authorRole,
    required PostMode mode,
    String? teamId,
    required String content,
    String? imageUrl,
  }) async {
    try {
      // Only Captain and Team Lead can post in General mode
      if (mode == PostMode.GENERAL && 
          authorRole != UserRole.CAPTAIN && 
          authorRole != UserRole.TEAM_LEAD) {
        throw Exception('Only Captain and Team Lead can post in General mode');
      }

      final postRef = _firebaseService.postsCollection.doc();
      final post = Post(
        id: postRef.id,
        authorId: authorId,
        authorName: authorName,
        authorRole: authorRole,
        mode: mode,
        teamId: teamId,
        content: content,
        imageUrl: imageUrl,
        timestamp: DateTime.now(),
      );

      await postRef.set(post.toFirestore());
      logger.i('Post created: ${postRef.id}');
      return post;
    } catch (e) {
      logger.e('Error creating post: $e');
      return null;
    }
  }

  // Get general posts
  Future<List<Post>> getGeneralPosts({int limit = 50}) async {
    try {
      final query = await _firebaseService.postsCollection
          .where('mode', isEqualTo: 'GENERAL')
          .orderBy('timestamp', descending: true)
          .limit(limit)
          .get();

      return query.docs
          .map((doc) => Post.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
          .toList();
    } catch (e) {
      logger.e('Error getting general posts: $e');
      return [];
    }
  }

  // Get team posts
  Future<List<Post>> getTeamPosts(String teamId, {int limit = 50}) async {
    try {
      final query = await _firebaseService.postsCollection
          .where('mode', isEqualTo: 'TEAM')
          .where('teamId', isEqualTo: teamId)
          .orderBy('timestamp', descending: true)
          .limit(limit)
          .get();

      return query.docs
          .map((doc) => Post.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
          .toList();
    } catch (e) {
      logger.e('Error getting team posts: $e');
      return [];
    }
  }

  // Stream general posts
  Stream<List<Post>> streamGeneralPosts({int limit = 50}) {
    try {
      return _firebaseService.postsCollection
          .where('mode', isEqualTo: 'GENERAL')
          .orderBy('timestamp', descending: true)
          .limit(limit)
          .snapshots()
          .map((snapshot) {
        return snapshot.docs
            .map((doc) => Post.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
            .toList();
      });
    } catch (e) {
      logger.e('Error streaming general posts: $e');
      return Stream.value([]);
    }
  }

  // Stream team posts
  Stream<List<Post>> streamTeamPosts(String teamId, {int limit = 50}) {
    try {
      return _firebaseService.postsCollection
          .where('mode', isEqualTo: 'TEAM')
          .where('teamId', isEqualTo: teamId)
          .orderBy('timestamp', descending: true)
          .limit(limit)
          .snapshots()
          .map((snapshot) {
        return snapshot.docs
            .map((doc) => Post.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
            .toList();
      });
    } catch (e) {
      logger.e('Error streaming team posts: $e');
      return Stream.value([]);
    }
  }

  // Delete post
  Future<void> deletePost(String postId) async {
    try {
      await _firebaseService.postsCollection.doc(postId).delete();
      logger.i('Post deleted: $postId');
    } catch (e) {
      logger.e('Error deleting post: $e');
      rethrow;
    }
  }
}
