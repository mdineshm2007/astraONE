// Models for ASTRA App

enum UserRole {
  CAPTAIN('CAPTAIN'),
  TEAM_LEAD('TEAM_LEAD'),
  MEMBER('MEMBER');

  final String value;
  const UserRole(this.value);

  static UserRole fromString(String value) {
    return UserRole.values.firstWhere(
      (e) => e.value == value,
      orElse: () => UserRole.MEMBER,
    );
  }
}

class User {
  final String id;
  final String email;
  final String name;
  final UserRole role;
  final String? teamId;
  final bool isActive;
  final DateTime createdAt;
  final DateTime? lastActiveAt;

  User({
    required this.id,
    required this.email,
    required this.name,
    required this.role,
    this.teamId,
    this.isActive = false,
    required this.createdAt,
    this.lastActiveAt,
  });

  factory User.fromFirestore(Map<String, dynamic> data, String id) {
    try {
      return User(
        id: id,
        email: data['email'] ?? '',
        name: data['name'] ?? 'Unknown',
        role: UserRole.fromString(data['role'] ?? 'MEMBER'),
        teamId: data['teamId'],
        isActive: data['isActive'] ?? false,
        createdAt: data['createdAt'] != null
            ? DateTime.parse(data['createdAt'].toString())
            : DateTime.now(),
        lastActiveAt: data['lastActiveAt'] != null
            ? DateTime.parse(data['lastActiveAt'].toString())
            : null,
      );
    } catch (e) {
      throw Exception('Error parsing user: $e');
    }
  }

  Map<String, dynamic> toFirestore() {
    return {
      'email': email,
      'name': name,
      'role': role.value,
      'teamId': teamId,
      'isActive': isActive,
      'createdAt': createdAt.toIso8601String(),
      'lastActiveAt': lastActiveAt?.toIso8601String(),
    };
  }

  bool get isCaptain => role == UserRole.CAPTAIN;
  bool get isTeamLead => role == UserRole.TEAM_LEAD;
  bool get isMember => role == UserRole.MEMBER;

  User copyWith({
    String? id,
    String? email,
    String? name,
    UserRole? role,
    String? teamId,
    bool? isActive,
    DateTime? createdAt,
    DateTime? lastActiveAt,
  }) {
    return User(
      id: id ?? this.id,
      email: email ?? this.email,
      name: name ?? this.name,
      role: role ?? this.role,
      teamId: teamId ?? this.teamId,
      isActive: isActive ?? this.isActive,
      createdAt: createdAt ?? this.createdAt,
      lastActiveAt: lastActiveAt ?? this.lastActiveAt,
    );
  }
}

class Team {
  final String id;
  final String name;
  final String description;
  final List<String> memberIds;
  final String leadId;
  final DateTime createdAt;
  final bool isActive;

  Team({
    required this.id,
    required this.name,
    required this.description,
    required this.memberIds,
    required this.leadId,
    required this.createdAt,
    this.isActive = true,
  });

  factory Team.fromFirestore(Map<String, dynamic> data, String id) {
    try {
      return Team(
        id: id,
        name: data['name'] ?? 'Unnamed Team',
        description: data['description'] ?? '',
        memberIds: List<String>.from(data['memberIds'] ?? []),
        leadId: data['leadId'] ?? '',
        createdAt: data['createdAt'] != null
            ? DateTime.parse(data['createdAt'].toString())
            : DateTime.now(),
        isActive: data['isActive'] ?? true,
      );
    } catch (e) {
      throw Exception('Error parsing team: $e');
    }
  }

  Map<String, dynamic> toFirestore() {
    return {
      'name': name,
      'description': description,
      'memberIds': memberIds,
      'leadId': leadId,
      'createdAt': createdAt.toIso8601String(),
      'isActive': isActive,
    };
  }

  Team copyWith({
    String? id,
    String? name,
    String? description,
    List<String>? memberIds,
    String? leadId,
    DateTime? createdAt,
    bool? isActive,
  }) {
    return Team(
      id: id ?? this.id,
      name: name ?? this.name,
      description: description ?? this.description,
      memberIds: memberIds ?? this.memberIds,
      leadId: leadId ?? this.leadId,
      createdAt: createdAt ?? this.createdAt,
      isActive: isActive ?? this.isActive,
    );
  }
}

enum TaskStatus {
  PENDING('Pending'),
  IN_PROGRESS('In Progress'),
  COMPLETED('Completed'),
  BLOCKED('Blocked');

  final String displayName;
  const TaskStatus(this.displayName);

  static TaskStatus fromString(String value) {
    return TaskStatus.values.firstWhere(
      (e) => e.name == value || e.displayName == value,
      orElse: () => TaskStatus.PENDING,
    );
  }
}

enum TaskPriority {
  LOW('Low'),
  MEDIUM('Medium'),
  HIGH('High'),
  CRITICAL('Critical');

  final String displayName;
  const TaskPriority(this.displayName);

  static TaskPriority fromString(String value) {
    return TaskPriority.values.firstWhere(
      (e) => e.name == value || e.displayName == value,
      orElse: () => TaskPriority.MEDIUM,
    );
  }
}

class Task {
  final String id;
  final String teamId;
  final String title;
  final String description;
  final String assignedTo;
  final String createdBy;
  final TaskStatus status;
  final TaskPriority priority;
  final DateTime deadline;
  final List<String> dependencies;
  final DateTime createdAt;
  final DateTime? updatedAt;

  Task({
    required this.id,
    required this.teamId,
    required this.title,
    required this.description,
    required this.assignedTo,
    required this.createdBy,
    required this.status,
    required this.priority,
    required this.deadline,
    required this.dependencies,
    required this.createdAt,
    this.updatedAt,
  });

  factory Task.fromFirestore(Map<String, dynamic> data, String id) {
    try {
      return Task(
        id: id,
        teamId: data['teamId'] ?? '',
        title: data['title'] ?? 'Untitled Task',
        description: data['description'] ?? '',
        assignedTo: data['assignedTo'] ?? '',
        createdBy: data['createdBy'] ?? '',
        status: TaskStatus.fromString(data['status'] ?? 'PENDING'),
        priority: TaskPriority.fromString(data['priority'] ?? 'MEDIUM'),
        deadline: data['deadline'] != null
            ? DateTime.parse(data['deadline'].toString())
            : DateTime.now().add(Duration(days: 7)),
        dependencies: List<String>.from(data['dependencies'] ?? []),
        createdAt: data['createdAt'] != null
            ? DateTime.parse(data['createdAt'].toString())
            : DateTime.now(),
        updatedAt: data['updatedAt'] != null
            ? DateTime.parse(data['updatedAt'].toString())
            : null,
      );
    } catch (e) {
      throw Exception('Error parsing task: $e');
    }
  }

  Map<String, dynamic> toFirestore() {
    return {
      'teamId': teamId,
      'title': title,
      'description': description,
      'assignedTo': assignedTo,
      'createdBy': createdBy,
      'status': status.name,
      'priority': priority.name,
      'deadline': deadline.toIso8601String(),
      'dependencies': dependencies,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt?.toIso8601String(),
    };
  }

  Task copyWith({
    String? id,
    String? teamId,
    String? title,
    String? description,
    String? assignedTo,
    String? createdBy,
    TaskStatus? status,
    TaskPriority? priority,
    DateTime? deadline,
    List<String>? dependencies,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return Task(
      id: id ?? this.id,
      teamId: teamId ?? this.teamId,
      title: title ?? this.title,
      description: description ?? this.description,
      assignedTo: assignedTo ?? this.assignedTo,
      createdBy: createdBy ?? this.createdBy,
      status: status ?? this.status,
      priority: priority ?? this.priority,
      deadline: deadline ?? this.deadline,
      dependencies: dependencies ?? this.dependencies,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}

class TaskUpdate {
  final String id;
  final String taskId;
  final String userId;
  final int progressPercentage;
  final String remarks;
  final DateTime timestamp;

  TaskUpdate({
    required this.id,
    required this.taskId,
    required this.userId,
    required this.progressPercentage,
    required this.remarks,
    required this.timestamp,
  });

  factory TaskUpdate.fromFirestore(Map<String, dynamic> data, String id) {
    try {
      return TaskUpdate(
        id: id,
        taskId: data['taskId'] ?? '',
        userId: data['userId'] ?? '',
        progressPercentage: data['progressPercentage'] ?? 0,
        remarks: data['remarks'] ?? '',
        timestamp: data['timestamp'] != null
            ? DateTime.parse(data['timestamp'].toString())
            : DateTime.now(),
      );
    } catch (e) {
      throw Exception('Error parsing task update: $e');
    }
  }

  Map<String, dynamic> toFirestore() {
    return {
      'taskId': taskId,
      'userId': userId,
      'progressPercentage': progressPercentage,
      'remarks': remarks,
      'timestamp': timestamp.toIso8601String(),
    };
  }
}

enum PostMode {
  GENERAL('General'),
  TEAM('Team');

  final String displayName;
  const PostMode(this.displayName);
}

class Post {
  final String id;
  final String authorId;
  final String authorName;
  final UserRole authorRole;
  final PostMode mode;
  final String? teamId;
  final String content;
  final String? imageUrl;
  final DateTime timestamp;

  Post({
    required this.id,
    required this.authorId,
    required this.authorName,
    required this.authorRole,
    required this.mode,
    this.teamId,
    required this.content,
    this.imageUrl,
    required this.timestamp,
  });

  factory Post.fromFirestore(Map<String, dynamic> data, String id) {
    try {
      return Post(
        id: id,
        authorId: data['authorId'] ?? '',
        authorName: data['authorName'] ?? 'Unknown',
        authorRole: UserRole.fromString(data['authorRole'] ?? 'MEMBER'),
        mode: data['mode'] == 'TEAM' ? PostMode.TEAM : PostMode.GENERAL,
        teamId: data['teamId'],
        content: data['content'] ?? '',
        imageUrl: data['imageUrl'],
        timestamp: data['timestamp'] != null
            ? DateTime.parse(data['timestamp'].toString())
            : DateTime.now(),
      );
    } catch (e) {
      throw Exception('Error parsing post: $e');
    }
  }

  Map<String, dynamic> toFirestore() {
    return {
      'authorId': authorId,
      'authorName': authorName,
      'authorRole': authorRole.value,
      'mode': mode.name,
      'teamId': teamId,
      'content': content,
      'imageUrl': imageUrl,
      'timestamp': timestamp.toIso8601String(),
    };
  }
}

enum QueryStatus {
  OPEN('Open'),
  RESOLVED('Resolved');

  final String displayName;
  const QueryStatus(this.displayName);

  static QueryStatus fromString(String value) {
    return QueryStatus.values.firstWhere(
      (e) => e.name == value || e.displayName == value,
      orElse: () => QueryStatus.OPEN,
    );
  }
}

class Query {
  final String id;
  final String senderId;
  final String senderName;
  final String content;
  final String? attachmentUrl;
  final QueryStatus status;
  final DateTime timestamp;
  final String? response;
  final DateTime? resolvedAt;

  Query({
    required this.id,
    required this.senderId,
    required this.senderName,
    required this.content,
    this.attachmentUrl,
    required this.status,
    required this.timestamp,
    this.response,
    this.resolvedAt,
  });

  factory Query.fromFirestore(Map<String, dynamic> data, String id) {
    try {
      return Query(
        id: id,
        senderId: data['senderId'] ?? '',
        senderName: data['senderName'] ?? 'Unknown',
        content: data['content'] ?? '',
        attachmentUrl: data['attachmentUrl'],
        status: QueryStatus.fromString(data['status'] ?? 'OPEN'),
        timestamp: data['timestamp'] != null
            ? DateTime.parse(data['timestamp'].toString())
            : DateTime.now(),
        response: data['response'],
        resolvedAt: data['resolvedAt'] != null
            ? DateTime.parse(data['resolvedAt'].toString())
            : null,
      );
    } catch (e) {
      throw Exception('Error parsing query: $e');
    }
  }

  Map<String, dynamic> toFirestore() {
    return {
      'senderId': senderId,
      'senderName': senderName,
      'content': content,
      'attachmentUrl': attachmentUrl,
      'status': status.name,
      'timestamp': timestamp.toIso8601String(),
      'response': response,
      'resolvedAt': resolvedAt?.toIso8601String(),
    };
  }
}

class LocalNote {
  final String id;
  final String title;
  final String content;
  final DateTime createdAt;
  final DateTime updatedAt;

  LocalNote({
    required this.id,
    required this.title,
    required this.content,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'title': title,
      'content': content,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  factory LocalNote.fromMap(Map<String, dynamic> map) {
    return LocalNote(
      id: map['id'] ?? '',
      title: map['title'] ?? '',
      content: map['content'] ?? '',
      createdAt: map['createdAt'] != null
          ? DateTime.parse(map['createdAt'])
          : DateTime.now(),
      updatedAt: map['updatedAt'] != null
          ? DateTime.parse(map['updatedAt'])
          : DateTime.now(),
    );
  }

  LocalNote copyWith({
    String? id,
    String? title,
    String? content,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return LocalNote(
      id: id ?? this.id,
      title: title ?? this.title,
      content: content ?? this.content,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
