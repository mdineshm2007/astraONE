// Notes Screen
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../providers/note_provider.dart';
import '../widgets/common.dart';

class NotesScreen extends StatefulWidget {
  const NotesScreen({Key? key}) : super(key: key);

  @override
  State<NotesScreen> createState() => _NotesScreenState();
}

class _NotesScreenState extends State<NotesScreen> {
  late TextEditingController _searchController;

  @override
  void initState() {
    super.initState();
    _searchController = TextEditingController();
    _initializeNotes();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _initializeNotes() {
    final noteProvider = context.read<NoteProvider>();
    noteProvider.loadAllNotes();
  }

  @override
  Widget build(BuildContext context) {
    return ErrorBoundary(
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Private Notes'),
          elevation: 0,
          subtitle: const Text('Local storage only - Not synced'),
        ),
        body: Consumer<NoteProvider>(
          builder: (context, noteProvider, _) {
            if (noteProvider.isLoading) {
              return const LoadingWidget(message: 'Loading notes...');
            }

            return SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                children: [
                  _buildSearchBar(),
                  const SizedBox(height: 16),
                  if (noteProvider.notes.isEmpty)
                    const EmptyStateWidget(
                      title: 'No Notes Yet',
                      subtitle: 'Create your first note',
                      icon: Icons.note_outlined,
                    )
                  else
                    ListView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: noteProvider.notes.length,
                      itemBuilder: (context, index) {
                        final note = noteProvider.notes[index];
                        return _buildNoteCard(note);
                      },
                    ),
                ],
              ),
            );
          },
        ),
        floatingActionButton: FloatingActionButton(
          onPressed: () => _showCreateNoteDialog(),
          child: const Icon(Icons.add),
        ),
      ),
    );
  }

  Widget _buildSearchBar() {
    return TextField(
      controller: _searchController,
      decoration: InputDecoration(
        hintText: 'Search notes...',
        prefixIcon: const Icon(Icons.search),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      onChanged: (query) {
        if (query.isEmpty) {
          context.read<NoteProvider>().loadAllNotes();
        } else {
          context.read<NoteProvider>().searchNotes(query);
        }
      },
    );
  }

  Widget _buildNoteCard(dynamic note) {
    return AppCard(
      onTap: () => _showEditNoteDialog(note),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  note.title,
                  style: Theme.of(context).textTheme.titleMedium,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              PopupMenuButton(
                itemBuilder: (context) => [
                  PopupMenuItem(
                    child: const Text('Edit'),
                    onTap: () => _showEditNoteDialog(note),
                  ),
                  PopupMenuItem(
                    child: const Text('Delete'),
                    onTap: () => _handleDeleteNote(note.id),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            note.content,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          Text(
            'Updated: ${note.updatedAt.toString().split('.')[0]}',
            style: Theme.of(context).textTheme.labelSmall,
          ),
        ],
      ),
    );
  }

  void _showCreateNoteDialog() {
    showDialog(
      context: context,
      builder: (context) => _buildNoteDialog(
        title: 'Create Note',
        onSave: (title, content) {
          context.read<NoteProvider>().createNote(
            title: title,
            content: content,
          );
          Navigator.pop(context);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Note created')),
          );
        },
      ),
    );
  }

  void _showEditNoteDialog(dynamic note) {
    showDialog(
      context: context,
      builder: (context) => _buildNoteDialog(
        title: 'Edit Note',
        initialTitle: note.title,
        initialContent: note.content,
        onSave: (title, content) {
          context.read<NoteProvider>().updateNote(
            noteId: note.id,
            title: title,
            content: content,
          );
          Navigator.pop(context);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Note updated')),
          );
        },
      ),
    );
  }

  void _handleDeleteNote(String noteId) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Note'),
        content: const Text('Are you sure you want to delete this note?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              context.read<NoteProvider>().deleteNote(noteId);
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Note deleted')),
              );
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }

  Widget _buildNoteDialog({
    required String title,
    String? initialTitle,
    String? initialContent,
    required Function(String, String) onSave,
  }) {
    late TextEditingController titleController;
    late TextEditingController contentController;

    titleController = TextEditingController(text: initialTitle ?? '');
    contentController = TextEditingController(text: initialContent ?? '');

    return AlertDialog(
      title: Text(title),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: titleController,
              decoration: const InputDecoration(
                labelText: 'Title',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: contentController,
              maxLines: 8,
              decoration: const InputDecoration(
                labelText: 'Content',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: () {
            if (titleController.text.isNotEmpty && contentController.text.isNotEmpty) {
              onSave(titleController.text, contentController.text);
            } else {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Please fill all fields')),
              );
            }
          },
          child: const Text('Save'),
        ),
      ],
    );
  }
}
