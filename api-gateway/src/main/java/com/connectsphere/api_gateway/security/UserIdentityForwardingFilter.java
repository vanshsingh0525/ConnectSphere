package com.connectsphere.api_gateway.security;

import java.util.List;

import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;

import io.jsonwebtoken.Claims;
import reactor.core.publisher.Mono;

@Component
public class UserIdentityForwardingFilter implements GlobalFilter, Ordered {

    public static final String USER_ID_HEADER = "X-User-Id";
    public static final String USERNAME_HEADER = "X-Username";
    public static final String USER_ROLE_HEADER = "X-User-Role";
    private static final String FALLBACK_ADMIN_USERNAME = "vanshslathia03";

    private final GatewayJwtService gatewayJwtService;

    public UserIdentityForwardingFilter(GatewayJwtService gatewayJwtService) {
        this.gatewayJwtService = gatewayJwtService;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, org.springframework.cloud.gateway.filter.GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest().mutate()
                .headers(headers -> {
                    headers.remove(USER_ID_HEADER);
                    headers.remove(USERNAME_HEADER);
                    headers.remove(USER_ROLE_HEADER);
                })
                .build();

        String path = request.getURI().getPath();
        boolean adminPath = path != null && path.startsWith("/admin");
        boolean downstreamAdminPath = path != null && path.contains("/admin/");

        List<String> authHeaders = request.getHeaders().getOrEmpty(HttpHeaders.AUTHORIZATION);
        if (authHeaders.isEmpty()) {
            if (adminPath) {
                exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                return exchange.getResponse().setComplete();
            }
            return chain.filter(exchange.mutate().request(request).build());
        }

        String authorizationHeader = authHeaders.get(0);
        if (!authorizationHeader.startsWith("Bearer ")) {
            if (adminPath) {
                exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                return exchange.getResponse().setComplete();
            }
            ServerHttpRequest sanitizedRequest = request.mutate()
                    .headers(headers -> headers.remove(HttpHeaders.AUTHORIZATION))
                    .build();
            return chain.filter(exchange.mutate().request(sanitizedRequest).build());
        }

        String token = authorizationHeader.substring(7);
        Claims claims;
        try {
            claims = gatewayJwtService.extractClaims(token);
        } catch (SecurityException ex) {
            if (adminPath) {
                exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                return exchange.getResponse().setComplete();
            }
            ServerHttpRequest sanitizedRequest = request.mutate()
                    .headers(headers -> headers.remove(HttpHeaders.AUTHORIZATION))
                    .build();
            return chain.filter(exchange.mutate().request(sanitizedRequest).build());
        }

        Object rawUserId = claims.get("userId");
        String username = claims.get("username", String.class);
        String role = claims.get("role", String.class);
        if (username == null || username.isBlank()) {
            username = claims.getSubject();
        }
        if (rawUserId == null || username == null || username.isBlank()) {
            if (adminPath) {
                exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                return exchange.getResponse().setComplete();
            }
            ServerHttpRequest sanitizedRequest = request.mutate()
                    .headers(headers -> headers.remove(HttpHeaders.AUTHORIZATION))
                    .build();
            return chain.filter(exchange.mutate().request(sanitizedRequest).build());
        }

        boolean adminByRole = role != null && "ADMIN".equalsIgnoreCase(role.trim());
        boolean adminByUsername = FALLBACK_ADMIN_USERNAME.equalsIgnoreCase(username.trim());
        boolean hasAdminAccess = adminByRole || adminByUsername;

        if (adminPath && !hasAdminAccess) {
            exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
            return exchange.getResponse().setComplete();
        }

        String forwardedRole = role == null ? "" : role;
        if (downstreamAdminPath && hasAdminAccess) {
            forwardedRole = "ADMIN";
        }

        ServerHttpRequest forwardedRequest = request.mutate()
                .header(USER_ID_HEADER, String.valueOf(rawUserId))
                .header(USERNAME_HEADER, username)
                .header(USER_ROLE_HEADER, forwardedRole)
                .build();

        return chain.filter(exchange.mutate().request(forwardedRequest).build());
    }

    @Override
    public int getOrder() {
        return -100;
    }
}
