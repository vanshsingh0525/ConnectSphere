package com.connectsphere.admin_service.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "admin_reports")
public class AdminReport {

    public enum TargetType { USER, POST, COMMENT }
    public enum Status { OPEN, RESOLVED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long reporterUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private TargetType targetType;

    @Column(nullable = false)
    private Long targetId;

    @Column(nullable = false, length = 500)
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.OPEN;

    @Column
    private Long resolvedByAdminId;

    @Column(length = 64)
    private String resolutionAction;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column
    private Instant resolvedAt;

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public Long getReporterUserId() { return reporterUserId; }
    public void setReporterUserId(Long reporterUserId) { this.reporterUserId = reporterUserId; }
    public TargetType getTargetType() { return targetType; }
    public void setTargetType(TargetType targetType) { this.targetType = targetType; }
    public Long getTargetId() { return targetId; }
    public void setTargetId(Long targetId) { this.targetId = targetId; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public Long getResolvedByAdminId() { return resolvedByAdminId; }
    public void setResolvedByAdminId(Long resolvedByAdminId) { this.resolvedByAdminId = resolvedByAdminId; }
    public String getResolutionAction() { return resolutionAction; }
    public void setResolutionAction(String resolutionAction) { this.resolutionAction = resolutionAction; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getResolvedAt() { return resolvedAt; }
    public void setResolvedAt(Instant resolvedAt) { this.resolvedAt = resolvedAt; }
}

