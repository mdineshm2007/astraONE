// User Provider
import 'package:provider/provider.dart';
import 'package:logger/logger.dart';
import '../models/index.dart';
import '../services/user_service.dart';

class UserProvider with ChangeNotifier {
  final UserService _userService = UserService();
  final Logger logger = Logger();

  List<User> _allUsers = [];
  List<User> _teamMembers = [];
  List<User> _activeMembers = [];
  bool _isLoading = false;
  String? _error;

  List<User> get allUsers => _allUsers;
  List<User> get teamMembers => _teamMembers;
  List<User> get activeMembers => _activeMembers;
  bool get isLoading => _isLoading;
  String? get error => _error;

  void clearError() {
    _error = null;
    notifyListeners();
  }

  // Get all users
  Future<void> fetchAllUsers() async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      _allUsers = await _userService.getAllUsers();
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      logger.e('Error fetching all users: $e');
      notifyListeners();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Get team members
  Future<void> fetchTeamMembers(String teamId) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      _teamMembers = await _userService.getTeamMembers(teamId);
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      logger.e('Error fetching team members: $e');
      notifyListeners();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Get active team members
  Future<void> fetchActiveMembers(String teamId) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      _activeMembers = await _userService.getActiveTeamMembers(teamId);
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      logger.e('Error fetching active members: $e');
      notifyListeners();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Update user status
  Future<void> setUserActiveStatus(String userId, bool isActive) async {
    try {
      await _userService.setUserActiveStatus(userId, isActive);
      // Refresh active members if needed
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      logger.e('Error updating user status: $e');
      notifyListeners();
    }
  }

  // Search users
  Future<List<User>> searchUsers(String query) async {
    try {
      return await _userService.searchUsersByName(query);
    } catch (e) {
      _error = e.toString();
      logger.e('Error searching users: $e');
      return [];
    }
  }
}
