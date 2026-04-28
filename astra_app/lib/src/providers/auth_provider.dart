// Auth Provider
import 'package:provider/provider.dart';
import 'package:logger/logger.dart';
import '../models/index.dart';
import '../services/auth_service.dart';

class AuthProvider with ChangeNotifier {
  final AuthService _authService = AuthService();
  final Logger logger = Logger();

  User? _currentUser;
  bool _isLoading = false;
  String? _error;

  User? get currentUser => _currentUser;
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get isAuthenticated => _currentUser != null;
  bool get isCaptain => _currentUser?.role == UserRole.CAPTAIN;
  bool get isTeamLead => _currentUser?.role == UserRole.TEAM_LEAD;
  bool get isMember => _currentUser?.role == UserRole.MEMBER;

  // Clear error
  void clearError() {
    _error = null;
    notifyListeners();
  }

  // Register
  Future<bool> register({
    required String email,
    required String password,
    required String name,
    required UserRole role,
    String? teamId,
  }) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      final user = await _authService.register(
        email: email,
        password: password,
        name: name,
        role: role,
        teamId: teamId,
      );

      if (user != null) {
        _currentUser = user;
        notifyListeners();
        return true;
      }
      return false;
    } catch (e) {
      _error = e.toString();
      logger.e('Registration error: $e');
      notifyListeners();
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Login
  Future<bool> login({
    required String email,
    required String password,
  }) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      final user = await _authService.login(
        email: email,
        password: password,
      );

      if (user != null) {
        _currentUser = user;
        notifyListeners();
        return true;
      }
      return false;
    } catch (e) {
      _error = e.toString();
      logger.e('Login error: $e');
      notifyListeners();
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Check session
  Future<void> checkSession() async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      final user = await _authService.checkSession();
      _currentUser = user;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      logger.e('Session check error: $e');
      notifyListeners();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Logout
  Future<void> logout() async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      await _authService.logout();
      _currentUser = null;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      logger.e('Logout error: $e');
      notifyListeners();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
