// Local Note Service - Uses SQLite for local-only storage
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'package:logger/logger.dart';
import '../models/index.dart';

class LocalNoteService {
  static final LocalNoteService _instance = LocalNoteService._internal();
  static final Logger logger = Logger();
  static Database? _database;

  factory LocalNoteService() {
    return _instance;
  }

  LocalNoteService._internal();

  static const String tableNotes = 'notes';
  static const String columnId = 'id';
  static const String columnTitle = 'title';
  static const String columnContent = 'content';
  static const String columnCreatedAt = 'createdAt';
  static const String columnUpdatedAt = 'updatedAt';

  // Initialize database
  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  Future<Database> _initDatabase() async {
    try {
      final databasesPath = await getDatabasesPath();
      final path = join(databasesPath, 'astra_notes.db');

      final db = await openDatabase(
        path,
        version: 1,
        onCreate: _onCreate,
      );
      logger.i('Local database initialized successfully');
      return db;
    } catch (e) {
      logger.e('Error initializing database: $e');
      rethrow;
    }
  }

  Future<void> _onCreate(Database db, int version) async {
    try {
      await db.execute('''
        CREATE TABLE $tableNotes (
          $columnId TEXT PRIMARY KEY,
          $columnTitle TEXT NOT NULL,
          $columnContent TEXT NOT NULL,
          $columnCreatedAt TEXT NOT NULL,
          $columnUpdatedAt TEXT NOT NULL
        )
      ''');
      logger.i('Notes table created');
    } catch (e) {
      logger.e('Error creating table: $e');
      rethrow;
    }
  }

  // Create note
  Future<LocalNote?> createNote({
    required String id,
    required String title,
    required String content,
  }) async {
    try {
      final db = await database;
      final note = LocalNote(
        id: id,
        title: title,
        content: content,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      await db.insert(tableNotes, note.toMap());
      logger.i('Note created: $id');
      return note;
    } catch (e) {
      logger.e('Error creating note: $e');
      return null;
    }
  }

  // Get note by ID
  Future<LocalNote?> getNoteById(String id) async {
    try {
      final db = await database;
      final maps = await db.query(
        tableNotes,
        where: '$columnId = ?',
        whereArgs: [id],
      );

      if (maps.isNotEmpty) {
        return LocalNote.fromMap(maps.first);
      }
      return null;
    } catch (e) {
      logger.e('Error getting note: $e');
      return null;
    }
  }

  // Get all notes
  Future<List<LocalNote>> getAllNotes() async {
    try {
      final db = await database;
      final maps = await db.query(tableNotes);

      return List<LocalNote>.from(
        maps.map((map) => LocalNote.fromMap(map)),
      );
    } catch (e) {
      logger.e('Error getting all notes: $e');
      return [];
    }
  }

  // Update note
  Future<void> updateNote(LocalNote note) async {
    try {
      final db = await database;
      final updatedNote = note.copyWith(updatedAt: DateTime.now());
      
      await db.update(
        tableNotes,
        updatedNote.toMap(),
        where: '$columnId = ?',
        whereArgs: [note.id],
      );
      logger.i('Note updated: ${note.id}');
    } catch (e) {
      logger.e('Error updating note: $e');
      rethrow;
    }
  }

  // Delete note
  Future<void> deleteNote(String id) async {
    try {
      final db = await database;
      await db.delete(
        tableNotes,
        where: '$columnId = ?',
        whereArgs: [id],
      );
      logger.i('Note deleted: $id');
    } catch (e) {
      logger.e('Error deleting note: $e');
      rethrow;
    }
  }

  // Search notes
  Future<List<LocalNote>> searchNotes(String query) async {
    try {
      final db = await database;
      final maps = await db.query(
        tableNotes,
        where: '$columnTitle LIKE ? OR $columnContent LIKE ?',
        whereArgs: ['%$query%', '%$query%'],
      );

      return List<LocalNote>.from(
        maps.map((map) => LocalNote.fromMap(map)),
      );
    } catch (e) {
      logger.e('Error searching notes: $e');
      return [];
    }
  }

  // Close database
  Future<void> closeDatabase() async {
    try {
      if (_database != null && _database!.isOpen) {
        await _database!.close();
        _database = null;
        logger.i('Database closed');
      }
    } catch (e) {
      logger.e('Error closing database: $e');
    }
  }
}
