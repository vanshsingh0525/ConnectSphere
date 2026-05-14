package com.connectsphere.admin_service.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.connectsphere.admin_service.entity.AdminAuditLog;

public interface AdminAuditLogRepository extends JpaRepository<AdminAuditLog, Long> {
    List<AdminAuditLog> findTop100ByOrderByCreatedAtDesc();
}

