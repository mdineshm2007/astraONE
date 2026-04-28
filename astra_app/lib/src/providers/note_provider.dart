// Note Provider
import 'package:provider/provider.dart';
import 'package:logger/logger.dart';
import 'package:uuid/uuid.dart';
import '../models/index.dart';
import '../services/local_note_service.dart';

class NoteProvider with ChangeNotifier {
  final LocalNoteService _noteService = LocalNoteService();
  final Logger logger = Logger();

  List<LocalNote> _notes = [];
  LocalNote? _currentNote;
  bool _isLoading = false;
  String? _error;

  List<LocalNote> get notes => _notes;
  LocalNote? get currentNote => _currentNote;
  bool get isLoading => _isLoading;
  String? get error => _error;

  void clearError() {
    _error = null;
    notifyListeners();
  }

  // Load all notes
  Future<void> loadAllNotes() async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      _notes = await _noteService.getAllNotes();
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      logger.e('Error loading notes: $e');
      notifyListeners();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Create note
  Future<bool> createNote({
    required String title,
    required String content,
  }) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      final id = const Uuid().v4();
      final note = await _noteService.createNote(
        id: id,
        title: title,
        content: content,
      );

      if (note != null) {
        _notes.add(note);
        notifyListeners();
        return true;
      }
      return false;
    } catch (e) {
      _error = e.toString();
      logger.e('Error creating note: $e');
      notifyListeners();
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Update note
  Future<bool> updateNote({
    required String noteId,
    String? title,
    String? content,
  }) async {
    try {
      final note = _notes.firstWhere((n) => n.id == noteId);
      final updatedNote = note.copyWith(
        title: title ?? note.title,
        content: content ?? note.content,
      );

      await _noteService.updateNote(updatedNote);
      
      final index = _notes.indexWhere((n) => n.id == noteId);
      if (index != -1) {
        _notes[index] = updatedNote;
      }

      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      logger.e('Error updating note: $e');
      notifyListeners();
      return false;
    }
  }

  // Delete note
  Future<bool> deleteNote(String noteId) async {
    try {
      await _noteService.deleteNote(noteId);
      _notes.removeWhere((n) => n.id == noteId);
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      logger.e('Error deleting note: $e');
      notifyListeners();
      return false;
    }
  }

  // Search notes
  Future<void> searchNotes(String query) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      if (query.isEmpty) {
        await loadAllNotes();
      } else {
        _notes = await _noteService.searchNotes(query);
        notifyListeners();
      }
    } catch (e) {
      _error = e.toString();
      logger.e('Error searching notes: $e');
      notifyListeners();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
