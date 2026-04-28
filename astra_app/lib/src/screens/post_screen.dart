// Post Screen (Feed)
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/index.dart';
import '../providers/auth_provider.dart';
import '../widgets/common.dart';

class PostFeedScreen extends StatefulWidget {
  const PostFeedScreen({Key? key}) : super(key: key);

  @override
  State<PostFeedScreen> createState() => _PostFeedScreenState();
}

class _PostFeedScreenState extends State<PostFeedScreen> {
  PostMode _selectedMode = PostMode.GENERAL;
  late TextEditingController _postController;

  @override
  void initState() {
    super.initState();
    _postController = TextEditingController();
  }

  @override
  void dispose() {
    _postController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ErrorBoundary(
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Posts'),
          elevation: 0,
        ),
        body: Consumer<AuthProvider>(
          builder: (context, authProvider, _) {
            if (authProvider.isLoading) {
              return const LoadingWidget();
            }

            final user = authProvider.currentUser;
            if (user == null) {
              return const EmptyStateWidget(
                title: 'Not Logged In',
                subtitle: 'Please log in to view posts',
                icon: Icons.login,
              );
            }

            return SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                children: [
                  if (authProvider.isCaptain || authProvider.isTeamLead)
                    _buildPostComposer(user),
                  const SizedBox(height: 24),
                  _buildPostFeed(),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildPostComposer(User user) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const CircleAvatar(
                child: Icon(Icons.person),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user.name),
                    RoleBadge(role: user.role.value),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _postController,
            maxLines: 4,
            decoration: InputDecoration(
              hintText: 'What\'s on your mind?',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.image),
                    onPressed: () {
                      // Image picker implementation
                    },
                  ),
                  DropdownButton<PostMode>(
                    value: _selectedMode,
                    items: PostMode.values
                        .map((mode) => DropdownMenuItem(
                          value: mode,
                          child: Text(mode.displayName),
                        ))
                        .toList(),
                    onChanged: (mode) {
                      if (mode != null) {
                        setState(() => _selectedMode = mode);
                      }
                    },
                  ),
                ],
              ),
              ElevatedButton(
                onPressed: _postController.text.isEmpty
                    ? null
                    : () => _handlePostSubmit(user),
                child: const Text('Post'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPostFeed() {
    return Column(
      children: [
        Text(
          'Recent Posts',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 12),
        ListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: 5, // Placeholder
          itemBuilder: (context, index) {
            return _buildPostCard(index);
          },
        ),
      ],
    );
  }

  Widget _buildPostCard(int index) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const CircleAvatar(
                child: Icon(Icons.person),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Author Name'),
                    Text(
                      'Team Lead • 2 hours ago',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Text('Post content goes here...'),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              TextButton.icon(
                icon: const Icon(Icons.favorite_border),
                label: const Text('Like'),
                onPressed: () {},
              ),
              TextButton.icon(
                icon: const Icon(Icons.comment_outlined),
                label: const Text('Comment'),
                onPressed: () {},
              ),
              TextButton.icon(
                icon: const Icon(Icons.share_outlined),
                label: const Text('Share'),
                onPressed: () {},
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _handlePostSubmit(User user) {
    // Post submission implementation
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Post submitted')),
    );
    _postController.clear();
  }
}
