// Task Service
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:logger/logger.dart';
import '../models/index.dart';
import 'firebase_service.dart';

class TaskService {
  static final TaskService _instance = TaskService._internal();
  static final Logger logger = Logger();

  factory TaskService() {
    return _instance;
  }

  TaskService._internal();

  final FirebaseService _firebaseService = FirebaseService();

  // Get task by ID
  Future<Task?> getTaskById(String taskId) async {
    try {
      final doc = await _firebaseService.tasksCollection.doc(taskId).get();
      
      if (!doc.exists || doc.data() == null) {
        return null;
      }

      return Task.fromFirestore(doc.data() as Map<String, dynamic>, doc.id);
    } catch (e) {
      logger.e('Error getting task: $e');
      return null;
    }
  }

  // Get tasks for team
  Future<List<Task>> getTeamTasks(String teamId) async {
    try {
      final query = await _firebaseService.tasksCollection
          .where('teamId', isEqualTo: teamId)
          .orderBy('deadline')
          .get();

      return query.docs
          .map((doc) => Task.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
          .toList();
    } catch (e) {
      logger.e('Error getting team tasks: $e');
      return [];
    }
  }

  // Get tasks assigned to user
  Future<List<Task>> getUserTasks(String userId) async {
    try {
      final query = await _firebaseService.tasksCollection
          .where('assignedTo', isEqualTo: userId)
          .orderBy('deadline')
          .get();

      return query.docs
          .map((doc) => Task.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
          .toList();
    } catch (e) {
      logger.e('Error getting user tasks: $e');
      return [];
    }
  }

  // Create task (Team Lead only)
  Future<Task?> createTask({
    required String teamId,
    required String title,
    required String description,
    required String assignedTo,
    required String createdBy,
    required TaskPriority priority,
    required DateTime deadline,
    List<String>? dependencies,
  }) async {
    try {
      final taskRef = _firebaseService.tasksCollection.doc();
      final task = Task(
        id: taskRef.id,
        teamId: teamId,
        title: title,
        description: description,
        assignedTo: assignedTo,
        createdBy: createdBy,
        status: TaskStatus.PENDING,
        priority: priority,
        deadline: deadline,
        dependencies: dependencies ?? [],
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      await taskRef.set(task.toFirestore());
      logger.i('Task created: ${taskRef.id}');
      return task;
    } catch (e) {
      logger.e('Error creating task: $e');
      return null;
    }
  }

  // Update task status
  Future<void> updateTaskStatus(String taskId, TaskStatus status) async {
    try {
      await _firebaseService.tasksCollection.doc(taskId).update({
        'status': status.name,
        'updatedAt': DateTime.now().toIso8601String(),
      });
      logger.i('Task status updated: $taskId -> ${status.name}');
    } catch (e) {
      logger.e('Error updating task status: $e');
      rethrow;
    }
  }

  // Update task
  Future<void> updateTask(Task task) async {
    try {
      await _firebaseService.tasksCollection.doc(task.id).update(task.toFirestore());
      logger.i('Task updated: ${task.id}');
    } catch (e) {
      logger.e('Error updating task: $e');
      rethrow;
    }
  }

  // Add task update (progress)
  Future<TaskUpdate?> addTaskUpdate({
    required String taskId,
    required String userId,
    required int progressPercentage,
    required String remarks,
  }) async {
    try {
      final updateRef = _firebaseService.taskUpdatesCollection.doc();
      final taskUpdate = TaskUpdate(
        id: updateRef.id,
        taskId: taskId,
        userId: userId,
        progressPercentage: progressPercentage,
        remarks: remarks,
        timestamp: DateTime.now(),
      );

      await updateRef.set(taskUpdate.toFirestore());
      
      // Update task status if progress is 100%
      if (progressPercentage >= 100) {
        await updateTaskStatus(taskId, TaskStatus.COMPLETED);
      } else if (progressPercentage > 0) {
        await updateTaskStatus(taskId, TaskStatus.IN_PROGRESS);
      }

      logger.i('Task update added: ${updateRef.id}');
      return taskUpdate;
    } catch (e) {
      logger.e('Error adding task update: $e');
      return null;
    }
  }

  // Get task updates
  Future<List<TaskUpdate>> getTaskUpdates(String taskId) async {
    try {
      final query = await _firebaseService.taskUpdatesCollection
          .where('taskId', isEqualTo: taskId)
          .orderBy('timestamp', descending: true)
          .get();

      return query.docs
          .map((doc) => TaskUpdate.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
          .toList();
    } catch (e) {
      logger.e('Error getting task updates: $e');
      return [];
    }
  }

  // Get latest task progress
  Future<int> getTaskProgress(String taskId) async {
    try {
      final updates = await getTaskUpdates(taskId);
      if (updates.isEmpty) return 0;
      return updates.first.progressPercentage;
    } catch (e) {
      logger.e('Error getting task progress: $e');
      return 0;
    }
  }

  // Stream team tasks
  Stream<List<Task>> streamTeamTasks(String teamId) {
    try {
      return _firebaseService.tasksCollection
          .where('teamId', isEqualTo: teamId)
          .orderBy('deadline')
          .snapshots()
          .map((snapshot) {
        return snapshot.docs
            .map((doc) => Task.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
            .toList();
      });
    } catch (e) {
      logger.e('Error streaming team tasks: $e');
      return Stream.value([]);
    }
  }

  // Stream user tasks
  Stream<List<Task>> streamUserTasks(String userId) {
    try {
      return _firebaseService.tasksCollection
          .where('assignedTo', isEqualTo: userId)
          .orderBy('deadline')
          .snapshots()
          .map((snapshot) {
        return snapshot.docs
            .map((doc) => Task.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
            .toList();
      });
    } catch (e) {
      logger.e('Error streaming user tasks: $e');
      return Stream.value([]);
    }
  }
}
