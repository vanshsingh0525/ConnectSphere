package com.connectsphere.admin_service.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.connectsphere.admin_service.entity.AdminAuditLog;
import com.connectsphere.admin_service.entity.AdminReport;
import com.connectsphere.admin_service.service.AdminOrchestrationService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@RestController
@RequestMapping("/admin")
@Validated
public class AdminController {

    private final AdminOrchestrationService adminService;

    public AdminController(AdminOrchestrationService adminService) {
        this.adminService = adminService;
    }

    @GetMapping("/users")
    public ResponseEntity<List<Map<String, Object>>> users(
            @RequestHeader("Authorization") String authorization) {
        return ResponseEntity.ok(adminService.getAllUsers(authorization));
    }

    @PatchMapping("/users/{userId}/status")
    public ResponseEntity<Map<String, Object>> userStatus(
            @RequestHeader("Authorization") String authorization,
            @RequestHeader(value = "X-User-Id", required = false) String adminIdHeader,
            @PathVariable Long userId,
            @Valid @RequestBody StatusRequest request) {
        return ResponseEntity.ok(adminService.updateUserStatus(authorization, parseAdminId(adminIdHeader), userId, request.status()));
    }

    @DeleteMapping("/users/{userId}")
    public ResponseEntity<Map<String, String>> deleteUser(
            @RequestHeader("Authorization") String authorization,
            @RequestHeader(value = "X-User-Id", required = false) String adminIdHeader,
            @PathVariable Long userId) {
        return ResponseEntity.ok(adminService.deleteUser(authorization, parseAdminId(adminIdHeader), userId));
    }

    @GetMapping("/posts")
    public ResponseEntity<List<Map<String, Object>>> posts(@RequestHeader("Authorization") String authorization) {
        return ResponseEntity.ok(adminService.getAllPosts(authorization));
    }

    @PutMapping("/posts/{postId}")
    public ResponseEntity<Map<String, Object>> editPost(
            @RequestHeader("Authorization") String authorization,
            @RequestHeader(value = "X-User-Id", required = false) String adminIdHeader,
            @PathVariable Long postId,
            @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(adminService.editPost(authorization, parseAdminId(adminIdHeader), postId, body));
    }

    @DeleteMapping("/posts/{postId}")
    public ResponseEntity<Map<String, String>> deletePost(
            @RequestHeader("Authorization") String authorization,
            @RequestHeader(value = "X-User-Id", required = false) String adminIdHeader,
            @PathVariable Long postId) {
        return ResponseEntity.ok(adminService.deletePost(authorization, parseAdminId(adminIdHeader), postId));
    }

    @PatchMapping("/posts/{postId}/flag")
    public ResponseEntity<Map<String, Object>> flagPost(
            @RequestHeader("Authorization") String authorization,
            @RequestHeader(value = "X-User-Id", required = false) String adminIdHeader,
            @PathVariable Long postId,
            @RequestParam(defaultValue = "true") boolean flagged) {
        return ResponseEntity.ok(adminService.flagPost(authorization, parseAdminId(adminIdHeader), postId, flagged));
    }

    @GetMapping("/comments")
    public ResponseEntity<List<Map<String, Object>>> comments(@RequestHeader("Authorization") String authorization) {
        return ResponseEntity.ok(adminService.getAllComments(authorization));
    }

    @PutMapping("/comments/{commentId}")
    public ResponseEntity<Map<String, Object>> editComment(
            @RequestHeader("Authorization") String authorization,
            @RequestHeader(value = "X-User-Id", required = false) String adminIdHeader,
            @PathVariable Long commentId,
            @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(adminService.editComment(authorization, parseAdminId(adminIdHeader), commentId, body));
    }

    @DeleteMapping("/comments/{commentId}")
    public ResponseEntity<Map<String, String>> deleteComment(
            @RequestHeader("Authorization") String authorization,
            @RequestHeader(value = "X-User-Id", required = false) String adminIdHeader,
            @PathVariable Long commentId) {
        return ResponseEntity.ok(adminService.deleteComment(authorization, parseAdminId(adminIdHeader), commentId));
    }

    @PostMapping("/reports")
    public ResponseEntity<AdminReport> createReport(
            @RequestHeader(value = "X-User-Id", required = false) String reporterIdHeader,
            @Valid @RequestBody CreateReportRequest request) {
        return ResponseEntity.ok(adminService.createReport(parseAdminId(reporterIdHeader), request.targetType(), request.targetId(), request.reason()));
    }

    @GetMapping("/reports")
    public ResponseEntity<List<AdminReport>> reports() {
        return ResponseEntity.ok(adminService.getOpenReports());
    }

    @PatchMapping("/reports/{reportId}/resolve")
    public ResponseEntity<AdminReport> resolveReport(
            @RequestHeader(value = "X-User-Id", required = false) String adminIdHeader,
            @PathVariable Long reportId,
            @Valid @RequestBody ResolveReportRequest request) {
        return ResponseEntity.ok(adminService.resolveReport(parseAdminId(adminIdHeader), reportId, request.action()));
    }

    @GetMapping("/moderation/flagged-posts")
    public ResponseEntity<List<Map<String, Object>>> flaggedPosts(@RequestHeader("Authorization") String authorization) {
        return ResponseEntity.ok(adminService.getAllPosts(authorization).stream()
                .filter(post -> Boolean.TRUE.equals(post.get("flagged")) || Boolean.TRUE.equals(post.get("isFlagged")))
                .toList());
    }

    @GetMapping("/analytics")
    public ResponseEntity<Map<String, Object>> analytics(@RequestHeader("Authorization") String authorization) {
        return ResponseEntity.ok(adminService.analytics(authorization));
    }

    @GetMapping("/hashtags")
    public ResponseEntity<List<Map<String, Object>>> hashtags(
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(adminService.hashtags(q, size));
    }

    @PostMapping("/notifications/send")
    public ResponseEntity<Void> sendNotification(
            @RequestHeader("Authorization") String authorization,
            @RequestHeader(value = "X-User-Id", required = false) String adminIdHeader,
            @Valid @RequestBody SendNotificationRequest request) {
        adminService.sendNotification(authorization, parseAdminId(adminIdHeader), request.message(), request.userIds());
        return ResponseEntity.accepted().build();
    }

    @GetMapping("/audit-logs")
    public ResponseEntity<List<AdminAuditLog>> auditLogs() {
        return ResponseEntity.ok(adminService.getAuditLogs());
    }

    private Long parseAdminId(String userIdHeader) {
        if (userIdHeader == null || userIdHeader.isBlank()) {
            return -1L;
        }
        return Long.parseLong(userIdHeader);
    }

    public record StatusRequest(@NotBlank String status) {}
    public record CreateReportRequest(@NotBlank String targetType, @NotNull Long targetId, @NotBlank String reason) {}
    public record ResolveReportRequest(@NotBlank String action) {}
    public record SendNotificationRequest(@NotBlank String message, List<Long> userIds) {}
}
