// Team Provider
import 'package:provider/provider.dart';
import 'package:logger/logger.dart';
import '../models/index.dart';
import '../services/team_service.dart';

class TeamProvider with ChangeNotifier {
  final TeamService _teamService = TeamService();
  final Logger logger = Logger();

  List<Team> _allTeams = [];
  Team? _currentTeam;
  bool _isLoading = false;
  String? _error;

  List<Team> get allTeams => _allTeams;
  Team? get currentTeam => _currentTeam;
  bool get isLoading => _isLoading;
  String? get error => _error;

  void clearError() {
    _error = null;
    notifyListeners();
  }

  // Fetch all teams
  Future<void> fetchAllTeams() async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      _allTeams = await _teamService.getAllTeams();
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      logger.e('Error fetching all teams: $e');
      notifyListeners();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Get team by ID
  Future<void> fetchTeamById(String teamId) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      _currentTeam = await _teamService.getTeamById(teamId);
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      logger.e('Error fetching team: $e');
      notifyListeners();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Create team
  Future<bool> createTeam({
    required String name,
    required String description,
    required String leadId,
    required List<String> memberIds,
  }) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      final team = await _teamService.createTeam(
        name: name,
        description: description,
        leadId: leadId,
        memberIds: memberIds,
      );

      if (team != null) {
        _allTeams.add(team);
        notifyListeners();
        return true;
      }
      return false;
    } catch (e) {
      _error = e.toString();
      logger.e('Error creating team: $e');
      notifyListeners();
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Get team progress summary
  Map<String, dynamic> getTeamProgressSummary(String teamId) {
    return {
      'totalTeams': _allTeams.length,
      'activeTeams': _allTeams.where((t) => t.isActive).length,
    };
  }
}
