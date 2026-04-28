// Query Screen
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/index.dart';
import '../providers/auth_provider.dart';
import '../widgets/common.dart';

class QueryScreen extends StatefulWidget {
  const QueryScreen({Key? key}) : super(key: key);

  @override
  State<QueryScreen> createState() => _QueryScreenState();
}

class _QueryScreenState extends State<QueryScreen> {
  late TextEditingController _queryController;

  @override
  void initState() {
    super.initState();
    _queryController = TextEditingController();
  }

  @override
  void dispose() {
    _queryController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ErrorBoundary(
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Queries'),
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
                subtitle: 'Please log in',
                icon: Icons.login,
              );
            }

            return SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Only show composer for all users
                  _buildQueryComposer(user),
                  const SizedBox(height: 24),
                  
                  // Only show query list for captain
                  if (authProvider.isCaptain)
                    _buildQueryList(authProvider),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildQueryComposer(User user) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Raise a Query',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _queryController,
            maxLines: 4,
            decoration: InputDecoration(
              hintText: 'Describe your query...',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(
                icon: const Icon(Icons.attach_file),
                onPressed: () {
                  // Attachment implementation
                },
              ),
              ElevatedButton(
                onPressed: _queryController.text.isEmpty
                    ? null
                    : () => _handleSubmitQuery(user),
                child: const Text('Submit Query'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildQueryList(AuthProvider authProvider) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'All Queries',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 12),
        if (!authProvider.isCaptain)
          const Padding(
            padding: EdgeInsets.all(16.0),
            child: Text(
              'Only Captain can view all queries',
              textAlign: TextAlign.center,
            ),
          )
        else
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: 3, // Placeholder
            itemBuilder: (context, index) => _buildQueryCard(index),
          ),
      ],
    );
  }

  Widget _buildQueryCard(int index) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Query From User'),
                    Text(
                      '2 hours ago',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              StatusBadge(
                label: 'Open',
                backgroundColor: Colors.orange,
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Text('Query content goes here...'),
          const SizedBox(height: 12),
          TextField(
            decoration: InputDecoration(
              hintText: 'Type response...',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            maxLines: 2,
          ),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerRight,
            child: ElevatedButton(
              onPressed: () {},
              child: const Text('Respond'),
            ),
          ),
        ],
      ),
    );
  }

  void _handleSubmitQuery(User user) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Query submitted')),
    );
    _queryController.clear();
  }
}
