// Task Provider
import 'package:provider/provider.dart';
import 'package:logger/logger.dart';
import '../models/index.dart';
import '../services/task_service.dart';

class TaskProvider with ChangeNotifier {
  final TaskService _taskService = TaskService();
  final Logger logger = Logger();

  List<Task> _teamTasks = [];
  List<Task> _userTasks = [];
  Map<String, int> _taskProgress = {};
  bool _isLoading = false;
  String? _error;

  List<Task> get teamTasks => _teamTasks;
  List<Task> get userTasks => _userTasks;
  Map<String, int> get taskProgress => _taskProgress;
  bool get isLoading => _isLoading;
  String? get error => _error;

  void clearError() {
    _error = null;
    notifyListeners();
  }

  // Fetch team tasks
  Future<void> fetchTeamTasks(String teamId) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      _teamTasks = await _taskService.getTeamTasks(teamId);
      
      // Fetch progress for each task
      for (final task in _teamTasks) {
        _taskProgress[task.id] = await _taskService.getTaskProgress(task.id);
      }
      
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      logger.e('Error fetching team tasks: $e');
      notifyListeners();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Fetch user tasks
  Future<void> fetchUserTasks(String userId) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      _userTasks = await _taskService.getUserTasks(userId);
      
      // Fetch progress for each task
      for (final task in _userTasks) {
        _taskProgress[task.id] = await _taskService.getTaskProgress(task.id);
      }
      
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      logger.e('Error fetching user tasks: $e');
      notifyListeners();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Create task
  Future<bool> createTask({
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
      _isLoading = true;
      _error = null;
      notifyListeners();

      final task = await _taskService.createTask(
        teamId: teamId,
        title: title,
        description: description,
        assignedTo: assignedTo,
        createdBy: createdBy,
        priority: priority,
        deadline: deadline,
        dependencies: dependencies,
      );

      if (task != null) {
        _teamTasks.add(task);
        _taskProgress[task.id] = 0;
        notifyListeners();
        return true;
      }
      return false;
    } catch (e) {
      _error = e.toString();
      logger.e('Error creating task: $e');
      notifyListeners();
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Update task progress
  Future<bool> updateTaskProgress({
    required String taskId,
    required int progressPercentage,
    required String remarks,
    required String userId,
  }) async {
    try {
      final update = await _taskService.addTaskUpdate(
        taskId: taskId,
        userId: userId,
        progressPercentage: progressPercentage,
        remarks: remarks,
      );

      if (update != null) {
        _taskProgress[taskId] = progressPercentage;
        
        // Update task status in local list
        final taskIndex = _userTasks.indexWhere((t) => t.id == taskId);
        if (taskIndex != -1) {
          if (progressPercentage >= 100) {
            _userTasks[taskIndex] = _userTasks[taskIndex].copyWith(
              status: TaskStatus.COMPLETED,
            );
          } else if (progressPercentage > 0) {
            _userTasks[taskIndex] = _userTasks[taskIndex].copyWith(
              status: TaskStatus.IN_PROGRESS,
            );
          }
        }
        
        notifyListeners();
        return true;
      }
      return false;
    } catch (e) {
      _error = e.toString();
      logger.e('Error updating task progress: $e');
      notifyListeners();
      return false;
    }
  }

  // Get team task summary
  Map<String, int> getTeamTaskSummary() {
    return {
      'total': _teamTasks.length,
      'pending': _teamTasks.where((t) => t.status == TaskStatus.PENDING).length,
      'inProgress': _teamTasks.where((t) => t.status == TaskStatus.IN_PROGRESS).length,
      'completed': _teamTasks.where((t) => t.status == TaskStatus.COMPLETED).length,
      'blocked': _teamTasks.where((t) => t.status == TaskStatus.BLOCKED).length,
    };
  }
}
