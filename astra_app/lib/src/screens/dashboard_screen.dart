// Dashboard Screen
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/index.dart';
import '../providers/auth_provider.dart';
import '../providers/team_provider.dart';
import '../widgets/common.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({Key? key}) : super(key: key);

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    _initializeData();
  }

  void _initializeData() {
    final teamProvider = context.read<TeamProvider>();
    teamProvider.fetchAllTeams();
  }

  @override
  Widget build(BuildContext context) {
    return ErrorBoundary(
      child: Scaffold(
        appBar: AppBar(
          title: const Text('ASTRA Dashboard'),
          elevation: 0,
          actions: [
            Consumer<AuthProvider>(
              builder: (context, authProvider, _) {
                return PopupMenuButton(
                  itemBuilder: (context) => [
                    PopupMenuItem(
                      child: const Text('Logout'),
                      onTap: () => _handleLogout(context),
                    ),
                  ],
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Center(
                      child: Text(authProvider.currentUser?.name ?? 'User'),
                    ),
                  ),
                );
              },
            ),
          ],
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
                subtitle: 'Please log in to continue',
                icon: Icons.login,
              );
            }

            return SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildWelcomeSection(user),
                  const SizedBox(height: 24),
                  _buildQuickAccess(),
                  const SizedBox(height: 24),
                  _buildTeamsSection(),
                ],
              ),
            );
          },
        ),
        bottomNavigationBar: _buildBottomNav(context),
      ),
    );
  }

  Widget _buildWelcomeSection(User user) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Welcome, ${user.name}',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Role: ${user.role.value.replaceAll('_', ' ')}',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              ),
              RoleBadge(role: user.role.value),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildQuickAccess() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Quick Access',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          childAspectRatio: 1.5,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            _buildQuickAccessCard(
              'Tasks',
              Icons.assignment,
              Colors.blue,
              () => Navigator.pushNamed(context, '/tasks'),
            ),
            _buildQuickAccessCard(
              'Posts',
              Icons.post_add,
              Colors.green,
              () => Navigator.pushNamed(context, '/posts'),
            ),
            _buildQuickAccessCard(
              'Queries',
              Icons.help,
              Colors.purple,
              () => Navigator.pushNamed(context, '/queries'),
            ),
            _buildQuickAccessCard(
              'Notes',
              Icons.note,
              Colors.orange,
              () => Navigator.pushNamed(context, '/notes'),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildQuickAccessCard(
    String title,
    IconData icon,
    Color color,
    VoidCallback onTap,
  ) {
    return AppCard(
      onTap: onTap,
      backgroundColor: color.withOpacity(0.1),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 32, color: color),
          const SizedBox(height: 8),
          Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }

  Widget _buildTeamsSection() {
    return Consumer<TeamProvider>(
      builder: (context, teamProvider, _) {
        if (teamProvider.isLoading) {
          return const LoadingWidget();
        }

        if (teamProvider.allTeams.isEmpty) {
          return const EmptyStateWidget(
            title: 'No Teams',
            subtitle: 'No teams available yet',
            icon: Icons.group_off,
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Teams',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: teamProvider.allTeams.length,
              itemBuilder: (context, index) {
                final team = teamProvider.allTeams[index];
                return AppCard(
                  onTap: () => Navigator.pushNamed(
                    context,
                    '/team',
                    arguments: team.id,
                  ),
                  child: ListTile(
                    title: Text(team.name),
                    subtitle: Text(team.description),
                    trailing: const Icon(Icons.arrow_forward),
                  ),
                );
              },
            ),
          ],
        );
      },
    );
  }

  Widget _buildBottomNav(BuildContext context) {
    return BottomNavigationBar(
      items: const [
        BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
        BottomNavigationBarItem(icon: Icon(Icons.assignment), label: 'Tasks'),
        BottomNavigationBarItem(icon: Icon(Icons.group), label: 'Team'),
        BottomNavigationBarItem(icon: Icon(Icons.note), label: 'Notes'),
      ],
      onTap: (index) {
        switch (index) {
          case 0:
            break;
          case 1:
            Navigator.pushNamed(context, '/tasks');
            break;
          case 2:
            Navigator.pushNamed(context, '/team');
            break;
          case 3:
            Navigator.pushNamed(context, '/notes');
            break;
        }
      },
    );
  }

  Future<void> _handleLogout(BuildContext context) async {
    final authProvider = context.read<AuthProvider>();
    await authProvider.logout();
    if (context.mounted) {
      Navigator.of(context).pushReplacementNamed('/login');
    }
  }
}
