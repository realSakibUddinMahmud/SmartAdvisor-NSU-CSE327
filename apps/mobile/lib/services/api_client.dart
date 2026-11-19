import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../models/models.dart';

class NetworkUnavailableException implements Exception {
  final String message;
  const NetworkUnavailableException(this.message);

  @override
  String toString() => 'NetworkUnavailableException: $message';
}

class ApiException implements Exception {
  final int statusCode;
  final String message;
  final Map<String, dynamic>? body;

  const ApiException(
    this.statusCode,
    this.message, {
    this.body,
  });

  @override
  String toString() => 'ApiException($statusCode): $message';
}

class PetitionSubmitResult {
  final ExceptionCase exceptionCase;
  final BackendState state;

  const PetitionSubmitResult({
    required this.exceptionCase,
    required this.state,
  });
}

class WaitlistJoinResult {
  final int position;
  final WaitlistEntry? entry;
  final BackendState state;

  const WaitlistJoinResult({
    required this.position,
    this.entry,
    required this.state,
  });
}

typedef HttpClientFactory = HttpClient Function();
typedef WebSocketConnector = Future<WebSocket> Function(
  String url, {
  Map<String, dynamic>? headers,
});

class SmartAdvisorApiClient {
  static const String defaultApiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://localhost:4000',
  );

  final String originUrl;
  final HttpClientFactory? _httpClientFactory;
  final WebSocketConnector? _webSocketConnector;
  final Duration requestTimeout;
  void Function()? onReconnected;

  HttpClient? _httpClient;
  HttpClient? _sseClient;
  HttpClientRequest? _sseRequest;
  WebSocket? _ws;
  StreamSubscription<dynamic>? _wsSub;
  StreamSubscription<String>? _sseSub;
  Timer? _reconnectTimer;

  String? _authToken;
  String? _activeStudentId;
  bool _disposed = false;
  bool _manuallyDisconnected = false;
  bool _isConnected = false;
  bool _isSseFallback = false;
  bool _hasConnectedOnce = false;
  int _reconnectAttempt = 0;

  final StreamController<SyncEvent> _eventsController =
      StreamController<SyncEvent>.broadcast();
  final StreamController<bool> _connectionController =
      StreamController<bool>.broadcast();

  SmartAdvisorApiClient({
    String? baseUrl,
    HttpClientFactory? httpClientFactory,
    WebSocketConnector? webSocketConnector,
    this.requestTimeout = const Duration(seconds: 4),
    this.onReconnected,
  })  : originUrl = normalizeBaseUrl(baseUrl ?? defaultApiUrl),
        _httpClientFactory = httpClientFactory,
        _webSocketConnector = webSocketConnector;

  static String normalizeBaseUrl(String raw) {
    var trimmed = raw.trim();
    if (trimmed.isEmpty) return 'http://localhost:4000';
    while (trimmed.endsWith('/')) {
      trimmed = trimmed.substring(0, trimmed.length - 1);
    }
    if (trimmed.endsWith('/api/v1')) {
      trimmed = trimmed.substring(0, trimmed.length - '/api/v1'.length);
    }
    return trimmed;
  }

  String? get authToken => _authToken;
  bool get isConnected => _isConnected;
  bool get isSseFallback => _isSseFallback;
  Stream<SyncEvent> get events => _eventsController.stream;
  Stream<bool> get connectionStatus => _connectionController.stream;

  void setAuthToken(String? token) {
    _authToken = (token != null && token.isNotEmpty) ? token : null;
  }

  Uri buildApiUri(String path) {
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    if (normalizedPath == '/health') {
      return Uri.parse('$originUrl/health');
    }
    if (normalizedPath.startsWith('/api/v1')) {
      return Uri.parse('$originUrl$normalizedPath');
    }
    return Uri.parse('$originUrl/api/v1$normalizedPath');
  }

  Uri buildWsUri({String? studentId}) {
    final base = Uri.parse(originUrl);
    final wsScheme = base.scheme == 'https' ? 'wss' : 'ws';
    final query = <String, String>{};
    if (_authToken != null && _authToken!.isNotEmpty) {
      query['token'] = _authToken!;
    }
    final sid = studentId ?? _activeStudentId;
    if (sid != null && sid.isNotEmpty) {
      query['studentId'] = sid;
    }
    return base.replace(
      scheme: wsScheme,
      path: '${base.path}/ws'.replaceAll('//', '/'),
      queryParameters: query.isEmpty ? null : query,
    );
  }

  Uri buildSseUri() {
    return Uri.parse('$originUrl/api/v1/events');
  }

  HttpClient _ensureHttpClient() {
    if (_httpClient != null) return _httpClient!;
    final client = _httpClientFactory != null
        ? _httpClientFactory!()
        : (HttpClient()..connectionTimeout = const Duration(seconds: 2));
    _httpClient = client;
    return client;
  }

  Future<({int statusCode, Map<String, dynamic> json})> _requestJson(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    if (_disposed) {
      throw const NetworkUnavailableException('API client disposed');
    }
    final uri = buildApiUri(path);
    final client = _ensureHttpClient();

    try {
      final HttpClientRequest request;
      switch (method) {
        case 'POST':
          request = await client.postUrl(uri).timeout(requestTimeout);
          break;
        case 'DELETE':
          request = await client.deleteUrl(uri).timeout(requestTimeout);
          break;
        default:
          request = await client.getUrl(uri).timeout(requestTimeout);
          break;
      }

      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      if (_authToken != null && _authToken!.isNotEmpty) {
        request.headers.set(
          HttpHeaders.authorizationHeader,
          'Bearer $_authToken',
        );
      }
      if (body != null) {
        request.headers.contentType = ContentType.json;
        request.write(jsonEncode(body));
      }

      final response = await request.close().timeout(requestTimeout);
      final chunks = await response.toList().timeout(requestTimeout);
      final bytes = <int>[];
      for (final chunk in chunks) {
        bytes.addAll(chunk);
      }
      final rawBody = utf8.decode(bytes, allowMalformed: true);

      Map<String, dynamic> decoded = const {};
      if (rawBody.trim().isNotEmpty) {
        try {
          final parsed = jsonDecode(rawBody);
          if (parsed is Map<String, dynamic>) {
            decoded = parsed;
          } else {
            throw ApiException(
              response.statusCode,
              'Unexpected server response (${response.statusCode})',
            );
          }
        } on FormatException {
          throw ApiException(
            response.statusCode,
            'Unexpected server response (${response.statusCode})',
          );
        }
      }
      return (statusCode: response.statusCode, json: decoded);
    } on SocketException catch (e) {
      throw NetworkUnavailableException(e.message);
    } on TimeoutException catch (e) {
      throw NetworkUnavailableException(e.message ?? 'Request timed out');
    } on HandshakeException catch (e) {
      throw NetworkUnavailableException(e.message);
    } on HttpException catch (e) {
      throw NetworkUnavailableException(e.message);
    }
  }

  // ================= AUTH & HEALTH =================

  Future<LoginResponse> login({
    required String id,
    required String password,
    UserRole? role,
  }) async {
    final res = await _requestJson(
      'POST',
      '/auth/login',
      body: {
        'id': id,
        'password': password,
        if (role != null) 'role': role.wireValue,
      },
    );

    if (res.statusCode >= 200 && res.statusCode < 300) {
      final parsed = LoginResponse.fromJson(res.json);
      setAuthToken(parsed.token);
      _activeStudentId = parsed.user.id;
      return parsed;
    }

    throw ApiException(
      res.statusCode,
      (res.json['message'] ?? 'Authentication failed').toString(),
      body: res.json,
    );
  }

  Future<void> logout() async {
    try {
      if (_authToken != null) {
        await _requestJson('POST', '/auth/logout');
      }
    } finally {
      setAuthToken(null);
      _activeStudentId = null;
      await disconnectRealtime();
    }
  }

  Future<AuthUser> getMe() async {
    final res = await _requestJson('GET', '/auth/me');
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return AuthUser.fromJson(
        (res.json['user'] as Map<String, dynamic>?) ?? const {},
      );
    }
    throw ApiException(
      res.statusCode,
      (res.json['message'] ?? 'Failed to fetch user').toString(),
      body: res.json,
    );
  }

  Future<HealthCheckResult> getHealth() async {
    final res = await _requestJson('GET', '/health');
    if (res.statusCode == 200 || res.statusCode == 503) {
      return HealthCheckResult.fromJson(res.json);
    }
    throw ApiException(
      res.statusCode,
      'Health probe returned ${res.statusCode}',
      body: res.json,
    );
  }

  // ================= BOOTSTRAP & STUDENT ENDPOINTS =================

  Future<BackendState> getBootstrap() async {
    final res = await _requestJson('GET', '/bootstrap');
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return BackendState.fromJson(res.json);
    }
    throw ApiException(
      res.statusCode,
      (res.json['message'] ?? 'Bootstrap failed').toString(),
      body: res.json,
    );
  }

  Future<StageResult> stageSection(String sectionId) async {
    final res = await _requestJson(
      'POST',
      '/student/cart/stage',
      body: {'sectionId': sectionId},
    );

    if (res.statusCode == 200 && res.json['ok'] == true) {
      final state = res.json['state'] is Map<String, dynamic>
          ? BackendState.fromJson(res.json['state'] as Map<String, dynamic>)
          : null;
      return StageResult.staged(state: state);
    }

    final modal = res.json['modal']?.toString();
    final payload = res.json['payload'] as Map<String, dynamic>? ?? const {};

    if (res.statusCode == 422 || modal == 'rule_alert') {
      return StageResult.ruleAlert(
        section: payload['section'] is Map<String, dynamic>
            ? CourseSection.fromJson(payload['section'] as Map<String, dynamic>)
            : null,
        ruleCode: (payload['ruleCode'] ?? 'RULE-4.2').toString(),
        studentCredits: (payload['studentCredits'] as num?)?.toInt(),
        requiredCredits: (payload['requiredCredits'] as num?)?.toInt(),
        overrideEligible: payload['overrideEligible'] as bool?,
        missingPrerequisites:
            (payload['missingPrerequisites'] as List<dynamic>? ?? const [])
                .map((e) => e.toString())
                .toList(),
        conflictingSections:
            (payload['conflictingSections'] as List<dynamic>? ?? const [])
                .whereType<Map<String, dynamic>>()
                .map(CourseSection.fromJson)
                .toList(),
        message: res.json['message']?.toString(),
      );
    }

    if (res.statusCode == 409 || modal == 'section_full') {
      return StageResult.sectionFull(
        fullSection: payload['fullSection'] is Map<String, dynamic>
            ? CourseSection.fromJson(
                payload['fullSection'] as Map<String, dynamic>,
              )
            : null,
        alternatives: (payload['alternatives'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(CourseSection.fromJson)
            .toList(),
        message: res.json['message']?.toString(),
      );
    }

    throw ApiException(
      res.statusCode,
      (res.json['message'] ?? 'Failed to stage section').toString(),
      body: res.json,
    );
  }

  Future<BackendState> unstageSection(String sectionId) async {
    final res = await _requestJson(
      'DELETE',
      '/student/cart/${Uri.encodeComponent(sectionId)}',
    );
    if (res.statusCode >= 200 &&
        res.statusCode < 300 &&
        res.json['state'] is Map<String, dynamic>) {
      return BackendState.fromJson(res.json['state'] as Map<String, dynamic>);
    }
    throw ApiException(
      res.statusCode,
      (res.json['message'] ?? 'Failed to unstage section').toString(),
      body: res.json,
    );
  }

  Future<PetitionSubmitResult> submitPetition({
    String? sectionId,
    required String courseCode,
    required String ruleCode,
    required String reason,
  }) async {
    final res = await _requestJson(
      'POST',
      '/student/petitions',
      body: {
        if (sectionId != null && sectionId.isNotEmpty) 'sectionId': sectionId,
        'courseCode': courseCode,
        'ruleCode': ruleCode,
        'reason': reason,
      },
    );
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return PetitionSubmitResult(
        exceptionCase: ExceptionCase.fromJson(
          (res.json['exceptionCase'] as Map<String, dynamic>?) ?? const {},
        ),
        state: BackendState.fromJson(
          (res.json['state'] as Map<String, dynamic>?) ?? const {},
        ),
      );
    }
    throw ApiException(
      res.statusCode,
      (res.json['message'] ?? 'Petition submission failed').toString(),
      body: res.json,
    );
  }

  Future<WaitlistJoinResult> joinWaitlist(String sectionId) async {
    final res = await _requestJson(
      'POST',
      '/student/waitlist',
      body: {'sectionId': sectionId},
    );
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return WaitlistJoinResult(
        position: (res.json['position'] as num?)?.toInt() ?? 1,
        entry: res.json['entry'] is Map<String, dynamic>
            ? WaitlistEntry.fromJson(res.json['entry'] as Map<String, dynamic>)
            : null,
        state: BackendState.fromJson(
          (res.json['state'] as Map<String, dynamic>?) ?? const {},
        ),
      );
    }
    throw ApiException(
      res.statusCode,
      (res.json['message'] ?? 'Waitlist join failed').toString(),
      body: res.json,
    );
  }

  Future<SolveScheduleResult> solveSchedule({
    List<String>? courseCodes,
    required ScheduleStrategy strategy,
    double? maxCredits,
  }) async {
    final res = await _requestJson(
      'POST',
      '/student/schedule/solve',
      body: {
        if (courseCodes != null && courseCodes.isNotEmpty)
          'courseCodes': courseCodes,
        'strategy': strategy.wireValue,
        if (maxCredits != null) 'maxCredits': maxCredits,
      },
    );
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return SolveScheduleResult.fromJson(res.json);
    }
    throw ApiException(
      res.statusCode,
      (res.json['message'] ?? 'Schedule solver failed').toString(),
      body: res.json,
    );
  }

  Future<DagSummary> getDagEligible() async {
    final res = await _requestJson('GET', '/student/dag/eligible');
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return DagSummary.fromJson(res.json);
    }
    throw ApiException(
      res.statusCode,
      (res.json['message'] ?? 'Failed to fetch DAG summary').toString(),
      body: res.json,
    );
  }

  Future<EnrollConfirmResult> confirmEnrollment({
    bool simulateRdsFailure = false,
  }) async {
    final res = await _requestJson(
      'POST',
      '/student/enroll/confirm',
      body: {'simulateRdsFailure': simulateRdsFailure},
    );
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return EnrollConfirmResult.fromJson(res.json);
    }
    throw ApiException(
      res.statusCode,
      (res.json['message'] ?? 'Enrollment confirmation failed').toString(),
      body: res.json,
    );
  }

  Future<EnrollConfirmResult> resolveRdsFallback({
    required String failedSectionId,
    required String fallbackSectionId,
  }) async {
    final res = await _requestJson(
      'POST',
      '/student/rds/fallback',
      body: {
        'failedSectionId': failedSectionId,
        'fallbackSectionId': fallbackSectionId,
      },
    );
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return EnrollConfirmResult.fromJson(res.json);
    }
    throw ApiException(
      res.statusCode,
      (res.json['message'] ?? 'RDS fallback resolution failed').toString(),
      body: res.json,
    );
  }

  // ================= REALTIME SYNC (WS + SSE FALLBACK) =================

  Future<void> connectRealtime({String? studentId}) async {
    if (_disposed) return;
    if (studentId != null && studentId.isNotEmpty) {
      _activeStudentId = studentId;
    }
    _manuallyDisconnected = false;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;

    await _closeActiveStreams();
    if (_disposed || _manuallyDisconnected) return;

    try {
      final wsUri = buildWsUri(studentId: _activeStudentId);
      final headers = <String, dynamic>{};
      if (_authToken != null && _authToken!.isNotEmpty) {
        headers[HttpHeaders.authorizationHeader] = 'Bearer $_authToken';
      }

      final ws = _webSocketConnector != null
          ? await _webSocketConnector!(
              wsUri.toString(),
              headers: headers.isEmpty ? null : headers,
            ).timeout(const Duration(seconds: 3))
          : await WebSocket.connect(
              wsUri.toString(),
              headers: headers.isEmpty ? null : headers,
            ).timeout(const Duration(seconds: 3));

      if (_disposed || _manuallyDisconnected) {
        unawaited(ws.close());
        return;
      }

      _ws = ws;
      _isSseFallback = false;
      _setConnectionStatus(true);
      _reconnectAttempt = 0;

      if (_hasConnectedOnce) {
        onReconnected?.call();
      }
      _hasConnectedOnce = true;

      _wsSub = ws.listen(
        (dynamic data) {
          if (_disposed) return;
          _handleRealtimePayload(data.toString());
        },
        onError: (_) {
          _handleStreamDisconnected();
        },
        onDone: () {
          _handleStreamDisconnected();
        },
        cancelOnError: true,
      );
      return;
    } catch (_) {
      if (_disposed || _manuallyDisconnected) return;
    }

    // WebSocket failed — attempt SSE fallback
    await _connectSse();
  }

  Future<void> _connectSse() async {
    if (_disposed || _manuallyDisconnected) return;
    try {
      _sseClient?.close(force: true);
      final client = _httpClientFactory != null
          ? _httpClientFactory!()
          : (HttpClient()..connectionTimeout = const Duration(seconds: 2));
      _sseClient = client;

      final req = await client.getUrl(buildSseUri()).timeout(requestTimeout);
      req.headers.set(HttpHeaders.acceptHeader, 'text/event-stream');
      if (_authToken != null && _authToken!.isNotEmpty) {
        req.headers.set(HttpHeaders.authorizationHeader, 'Bearer $_authToken');
      }
      _sseRequest = req;

      final response = await req.close().timeout(requestTimeout);
      if (response.statusCode != 200) {
        client.close(force: true);
        _sseClient = null;
        _sseRequest = null;
        throw HttpException('SSE HTTP ${response.statusCode}');
      }

      if (_disposed || _manuallyDisconnected) {
        client.close(force: true);
        return;
      }

      _isSseFallback = true;
      _setConnectionStatus(true);
      _reconnectAttempt = 0;

      if (_hasConnectedOnce) {
        onReconnected?.call();
      }
      _hasConnectedOnce = true;

      final dataBuffer = <String>[];
      _sseSub = response
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen(
        (line) {
          if (_disposed) return;
          if (line.startsWith(':')) {
            return;
          }
          if (line.isEmpty) {
            if (dataBuffer.isNotEmpty) {
              _handleRealtimePayload(dataBuffer.join('\n'));
              dataBuffer.clear();
            }
            return;
          }
          if (line.startsWith('data:')) {
            dataBuffer.add(line.substring(5).trimLeft());
          }
        },
        onError: (_) {
          _handleStreamDisconnected();
        },
        onDone: () {
          _handleStreamDisconnected();
        },
        cancelOnError: true,
      );
    } catch (_) {
      _handleStreamDisconnected();
    }
  }

  void _handleRealtimePayload(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return;
    try {
      final decoded = jsonDecode(trimmed);
      if (decoded is! Map<String, dynamic>) return;
      final event = SyncEvent.fromJson(decoded);
      if (event.type == 'PONG' || event.type.isEmpty) return;
      if (!_disposed && !_eventsController.isClosed) {
        _eventsController.add(event);
      }
    } catch (_) {
      // Ignore malformed realtime frames
    }
  }

  void _handleStreamDisconnected() {
    _setConnectionStatus(false);
    if (_disposed || _manuallyDisconnected) return;
    _scheduleReconnect();
  }

  void _scheduleReconnect() {
    if (_disposed || _manuallyDisconnected) return;
    if (_reconnectTimer != null && _reconnectTimer!.isActive) return;

    final delaySeconds = (1 << _reconnectAttempt).clamp(1, 15);
    _reconnectAttempt = (_reconnectAttempt + 1).clamp(0, 4);

    _reconnectTimer = Timer(Duration(seconds: delaySeconds), () {
      _reconnectTimer = null;
      if (_disposed || _manuallyDisconnected) return;
      unawaited(connectRealtime());
    });
  }

  void _setConnectionStatus(bool connected) {
    _isConnected = connected;
    if (!_disposed && !_connectionController.isClosed) {
      _connectionController.add(connected);
    }
  }

  Future<void> _closeActiveStreams() async {
    await _wsSub?.cancel();
    _wsSub = null;
    final ws = _ws;
    _ws = null;
    if (ws != null) {
      try {
        await ws.close();
      } catch (_) {}
    }

    await _sseSub?.cancel();
    _sseSub = null;
    try {
      _sseRequest?.abort();
    } catch (_) {}
    _sseRequest = null;
    _sseClient?.close(force: true);
    _sseClient = null;
  }

  Future<void> disconnectRealtime() async {
    _manuallyDisconnected = true;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _isSseFallback = false;
    _hasConnectedOnce = false;
    _setConnectionStatus(false);
    await _closeActiveStreams();
  }

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _manuallyDisconnected = true;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    unawaited(_wsSub?.cancel());
    _wsSub = null;
    if (_ws != null) {
      unawaited(_ws!.close().catchError((_) {}));
      _ws = null;
    }
    unawaited(_sseSub?.cancel());
    _sseSub = null;
    try {
      _sseRequest?.abort();
    } catch (_) {}
    _sseRequest = null;
    _sseClient?.close(force: true);
    _sseClient = null;
    _httpClient?.close(force: true);
    _httpClient = null;
    if (!_eventsController.isClosed) {
      unawaited(_eventsController.close());
    }
    if (!_connectionController.isClosed) {
      unawaited(_connectionController.close());
    }
  }
}
