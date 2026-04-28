// Task Manager Screen
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/index.dart';
import '../providers/auth_provider.dart';
import '../providers/task_provider.dart';
import '../providers/team_provider.dart';
import '../widgets/common.dart';

class TaskManagerScreen extends StatefulWidget {
  final String? teamId;

  const TaskManagerScreen({Key? key, this.teamId}) : super(key: key);

  @override
  State<TaskManagerScreen> createState() => _TaskManagerScreenState();
}

class _TaskManagerScreenState extends State<TaskManagerScreen> {
  TaskStatus? _selectedStatus;

  @override
  void initState() {
    super.initState();
    _initializeData();
  }

  void _initializeData() {
    final taskProvider = context.read<TaskProvider>();
    final authProvider = context.read<AuthProvider>();
    
    if (teamId != null) {
      taskProvider.fetchTeamTasks(teamId!);
    } else if (authProvider.currentUser != null) {
      taskProvider.fetchUserTasks(authProvider.currentUser!.id);
    }
  }

  String? get teamId => widget.teamId;

  @override
  Widget build(BuildContext context) {
    return ErrorBoundary(
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Task Manager'),
          elevation: 0,
        ),
        body: Consumer<TaskProvider>(
          builder: (context, taskProvider, _) {
            if (taskProvider.isLoading) {
              return const LoadingWidget();
            }

            final tasks = teamId != null 
                ? taskProvider.teamTasks 
                : taskProvider.userTasks;

            if (tasks.isEmpty) {
              return const EmptyStateWidget(
                title: 'No Tasks',
                subtitle: 'No tasks available',
                icon: Icons.assignment_late,
              );
            }

            return SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildFilterChips(),
                  const SizedBox(height: 16),
                  _buildTaskList(tasks),
                ],
              ),
            );
          },
        ),
        floatingActionButton: Consumer<AuthProvider>(
          builder: (context, authProvider, _) {
            if (teamId != null && 
                (authProvider.isCaptain || authProvider.isTeamLead)) {
              return FloatingActionButton(
                onPressed: () => _showCreateTaskDialog(),
                child: const Icon(Icons.add),
              );
            }
            return const SizedBox.shrink();
          },
        ),
      ),
    );
  }

  Widget _buildFilterChips() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: TaskStatus.values.map((status) {
          return Padding(
            padding: const EdgeInsets.only(right: 8.0),
            child: FilterChip(
              label: Text(status.displayName),
              selected: _selectedStatus == status,
              onSelected: (selected) {
                setState(() {
                  _selectedStatus = selected ? status : null;
                });
              },
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildTaskList(List<Task> tasks) {
    final filteredTasks = _selectedStatus != null
        ? tasks.where((t) => t.status == _selectedStatus).toList()
        : tasks;

    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: filteredTasks.length,
      itemBuilder: (context, index) {
        final task = filteredTasks[index];
        return _buildTaskCard(task);
      },
    );
  }

  Widget _buildTaskCard(Task task) {
    return AppCard(
      onTap: () => Navigator.pushNamed(
        context,
        '/task-detail',
        arguments: task.id,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  task.title,
                  style: Theme.of(context).textTheme.titleMedium,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              StatusBadge(
                label: task.status.displayName,
                backgroundColor: _getStatusColor(task.status),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            task.description,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Due: ${task.deadline.toString().split(' ')[0]}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              StatusBadge(
                label: task.priority.displayName,
                backgroundColor: _getPriorityColor(task.priority),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Color _getStatusColor(TaskStatus status) {
    switch (status) {
      case TaskStatus.PENDING:
        return Colors.grey;
      case TaskStatus.IN_PROGRESS:
        return Colors.blue;
      case TaskStatus.COMPLETED:
        return Colors.green;
      case TaskStatus.BLOCKED:
        return Colors.red;
    }
  }

  Color _getPriorityColor(TaskPriority priority) {
    switch (priority) {
      case TaskPriority.LOW:
        return Colors.green;
      case TaskPriority.MEDIUM:
        return Colors.blue;
      case TaskPriority.HIGH:
        return Colors.orange;
      case TaskPriority.CRITICAL:
        return Colors.red;
    }
  }

  void _showCreateTaskDialog() {
    // Implementation of create task dialog
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Create Task'),
        content: const Text('Create task implementation'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }
}
