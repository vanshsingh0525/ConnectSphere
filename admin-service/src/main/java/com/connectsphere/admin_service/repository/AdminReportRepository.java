package com.connectsphere.admin_service.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.connectsphere.admin_service.entity.AdminReport;

public interface AdminReportRepository extends JpaRepository<AdminReport, Long> {
    List<AdminReport> findByStatusOrderByCreatedAtDesc(AdminReport.Status status);
}

