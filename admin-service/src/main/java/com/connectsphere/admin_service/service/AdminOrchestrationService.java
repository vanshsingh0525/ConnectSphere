package com.connectsphere.admin_service.service;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import com.connectsphere.admin_service.entity.AdminAuditLog;
import com.connectsphere.admin_service.entity.AdminReport;
import com.connectsphere.admin_service.repository.AdminAuditLogRepository;
import com.connectsphere.admin_service.repository.AdminReportRepository;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class AdminOrchestrationService {

    private static final ParameterizedTypeReference<List<Map<String, Object>>> LIST_MAP_TYPE = new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<Map<String, Object>> MAP_TYPE = new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<Map<String, String>> MAP_STRING_TYPE = new ParameterizedTypeReference<>() {};

    private final RestClient restClient;
    private final String authAdminBaseUrl;
    private final String postAdminBaseUrl;
    private final String commentAdminBaseUrl;
    private final String searchBaseUrl;
    private final String notificationAdminBaseUrl;
    private final AdminAuditLogRepository auditLogRepository;
    private final AdminReportRepository reportRepository;

    public AdminOrchestrationService(
            RestClient.Builder restClientBuilder,
            @Value("${app.auth-service.base-url}") String authAdminBaseUrl,
            @Value("${app.post-service.base-url}") String postAdminBaseUrl,
            @Value("${app.comment-service.base-url}") String commentAdminBaseUrl,
            @Value("${app.search-service.base-url}") String searchBaseUrl,
            @Value("${app.notification-service.base-url}") String notificationAdminBaseUrl,
            AdminAuditLogRepository auditLogRepository,
            AdminReportRepository reportRepository) {
        this.restClient = restClientBuilder.build();
        this.authAdminBaseUrl = authAdminBaseUrl;
        this.postAdminBaseUrl = postAdminBaseUrl;
        this.commentAdminBaseUrl = commentAdminBaseUrl;
        this.searchBaseUrl = searchBaseUrl;
        this.notificationAdminBaseUrl = notificationAdminBaseUrl;
        this.auditLogRepository = auditLogRepository;
        this.reportRepository = reportRepository;
    }

    public List<Map<String, Object>> getAllUsers(String bearerToken) {
        return restClient.get().uri(authAdminBaseUrl + "/all").headers(h -> h.setBearerAuth(extractToken(bearerToken))).retrieve().body(LIST_MAP_TYPE);
    }

    @Transactional
    public Map<String, Object> updateUserStatus(String bearerToken, Long adminId, Long userId, String status) {
        Map<String, Object> result = restClient.patch().uri(authAdminBaseUrl + "/" + userId + "/status")
                .headers(h -> h.setBearerAuth(extractToken(bearerToken)))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("status", status))
                .retrieve().body(MAP_TYPE);
        audit(adminId, "USER_STATUS_UPDATED", "USER", String.valueOf(userId), "status=" + status);
        return result;
    }

    @Transactional
    public Map<String, String> deleteUser(String bearerToken, Long adminId, Long userId) {
        Map<String, String> result = restClient.delete().uri(authAdminBaseUrl + "/" + userId)
                .headers(h -> h.setBearerAuth(extractToken(bearerToken)))
                .retrieve().body(MAP_STRING_TYPE);
        audit(adminId, "USER_DELETED", "USER", String.valueOf(userId), "permanent=true");
        return result;
    }

    public List<Map<String, Object>> getAllPosts(String bearerToken) {
        Map<String, Object> page = restClient.get().uri(postAdminBaseUrl + "/all")
                .headers(h -> h.setBearerAuth(extractToken(bearerToken)))
                .retrieve().body(MAP_TYPE);
        Object content = page == null ? null : page.get("content");
        return content instanceof List<?> list ? list.stream().map(item -> (Map<String, Object>) item).toList() : List.of();
    }

    @Transactional
    public Map<String, Object> editPost(String bearerToken, Long adminId, Long postId, Map<String, Object> payload) {
        Map<String, Object> result = restClient.put().uri(postAdminBaseUrl + "/" + postId)
                .headers(h -> h.setBearerAuth(extractToken(bearerToken)))
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .retrieve().body(MAP_TYPE);
        audit(adminId, "POST_EDITED", "POST", String.valueOf(postId), null);
        return result;
    }

    @Transactional
    public Map<String, String> deletePost(String bearerToken, Long adminId, Long postId) {
        Map<String, String> result = restClient.delete().uri(postAdminBaseUrl + "/" + postId)
                .headers(h -> h.setBearerAuth(extractToken(bearerToken)))
                .retrieve().body(MAP_STRING_TYPE);
        audit(adminId, "POST_DELETED", "POST", String.valueOf(postId), "soft=true");
        return result;
    }

    @Transactional
    public Map<String, Object> flagPost(String bearerToken, Long adminId, Long postId, boolean flagged) {
        Map<String, Object> result = restClient.patch().uri(postAdminBaseUrl + "/" + postId + "/flag?flagged=" + flagged)
                .headers(h -> h.setBearerAuth(extractToken(bearerToken)))
                .retrieve().body(MAP_TYPE);
        audit(adminId, flagged ? "POST_FLAGGED" : "POST_APPROVED", "POST", String.valueOf(postId), null);
        return result;
    }

    public List<Map<String, Object>> getAllComments(String bearerToken) {
        return restClient.get().uri(commentAdminBaseUrl + "/all")
                .headers(h -> h.setBearerAuth(extractToken(bearerToken)))
                .retrieve().body(LIST_MAP_TYPE);
    }

    @Transactional
    public Map<String, Object> editComment(String bearerToken, Long adminId, Long commentId, Map<String, Object> payload) {
        Map<String, Object> result = restClient.put().uri(commentAdminBaseUrl + "/" + commentId)
                .headers(h -> h.setBearerAuth(extractToken(bearerToken)))
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .retrieve().body(MAP_TYPE);
        audit(adminId, "COMMENT_EDITED", "COMMENT", String.valueOf(commentId), null);
        return result;
    }

    @Transactional
    public Map<String, String> deleteComment(String bearerToken, Long adminId, Long commentId) {
        Map<String, String> result = restClient.delete().uri(commentAdminBaseUrl + "/" + commentId)
                .headers(h -> h.setBearerAuth(extractToken(bearerToken)))
                .retrieve().body(MAP_STRING_TYPE);
        audit(adminId, "COMMENT_DELETED", "COMMENT", String.valueOf(commentId), "soft=true");
        return result;
    }

    public Map<String, Object> analytics(String bearerToken) {
        Map<String, Object> userStats = restClient.get().uri(authAdminBaseUrl + "/stats").headers(h -> h.setBearerAuth(extractToken(bearerToken))).retrieve().body(MAP_TYPE);
        Map<String, Object> postStats = restClient.get().uri(postAdminBaseUrl + "/stats").headers(h -> h.setBearerAuth(extractToken(bearerToken))).retrieve().body(MAP_TYPE);
        Map<String, Object> commentStats = restClient.get().uri(commentAdminBaseUrl + "/stats").headers(h -> h.setBearerAuth(extractToken(bearerToken))).retrieve().body(MAP_TYPE);
        List<Map<String, Object>> trending = restClient.get().uri(searchBaseUrl + "/trending?size=10").retrieve().body(LIST_MAP_TYPE);
        return Map.of(
                "users", userStats == null ? Map.of() : userStats,
                "posts", postStats == null ? Map.of() : postStats,
                "comments", commentStats == null ? Map.of() : commentStats,
                "trendingHashtags", trending == null ? List.of() : trending
        );
    }

    public List<Map<String, Object>> hashtags(String query, int size) {
        String safe = query == null ? "" : query.trim();
        String uri = safe.isBlank() ? (searchBaseUrl + "/trending?size=" + size) : (searchBaseUrl + "/hashtags?q=" + safe + "&size=" + size);
        return restClient.get().uri(uri).retrieve().body(LIST_MAP_TYPE);
    }

    @Transactional
    public void sendNotification(String bearerToken, Long adminId, String message, List<Long> userIds) {
        restClient.post().uri(notificationAdminBaseUrl + "/send")
                .headers(h -> h.setBearerAuth(extractToken(bearerToken)))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("message", message, "userIds", userIds))
                .retrieve().toBodilessEntity();
        audit(adminId, "ADMIN_NOTIFICATION_SENT", "NOTIFICATION", "bulk", "recipients=" + (userIds == null ? 0 : userIds.size()));
    }

    @Transactional
    public AdminReport createReport(Long reporterUserId, String targetType, Long targetId, String reason) {
        AdminReport report = new AdminReport();
        report.setReporterUserId(reporterUserId);
        report.setTargetId(targetId);
        report.setReason(reason);
        try {
            report.setTargetType(AdminReport.TargetType.valueOf(targetType.toUpperCase()));
        } catch (Exception ex) {
            throw new ResponseStatusException(BAD_REQUEST, "targetType must be USER, POST, or COMMENT");
        }
        return reportRepository.save(report);
    }

    public List<AdminReport> getOpenReports() {
        return reportRepository.findByStatusOrderByCreatedAtDesc(AdminReport.Status.OPEN);
    }

    @Transactional
    public AdminReport resolveReport(Long adminId, Long reportId, String action) {
        AdminReport report = reportRepository.findById(reportId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Report not found"));
        report.setStatus(AdminReport.Status.RESOLVED);
        report.setResolvedByAdminId(adminId);
        report.setResolutionAction(action);
        report.setResolvedAt(Instant.now());
        audit(adminId, "REPORT_RESOLVED", report.getTargetType().name(), String.valueOf(report.getTargetId()), "action=" + action);
        return reportRepository.save(report);
    }

    public List<AdminAuditLog> getAuditLogs() {
        return auditLogRepository.findTop100ByOrderByCreatedAtDesc();
    }

    private void audit(Long adminId, String action, String targetType, String targetId, String details) {
        AdminAuditLog log = new AdminAuditLog();
        log.setAdminUserId(adminId == null ? -1L : adminId);
        log.setAction(action);
        log.setTargetType(targetType);
        log.setTargetId(targetId);
        log.setDetails(details);
        auditLogRepository.save(log);
    }

    private String extractToken(String bearerToken) {
        if (bearerToken == null || !bearerToken.startsWith("Bearer ")) {
            throw new ResponseStatusException(BAD_REQUEST, "Missing bearer token");
        }
        return bearerToken.substring(7);
    }
}

