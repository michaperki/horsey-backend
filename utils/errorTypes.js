// backend/utils/errorTypes.js
/**
 * Standardized error types for the application.
 * These can be used to create consistent error responses.
 */
class AppError extends Error {
  constructor(message, statusCode, errorCode, data = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.data = data;
    this.isOperational = true; // Flag to identify operational vs programming errors
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Authentication Errors
class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed', data = null) {
    super(message, 401, 'AUTH_ERROR', data);
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to perform this action', data = null) {
    super(message, 403, 'FORBIDDEN', data);
  }
}

// Resource Errors
class ResourceNotFoundError extends AppError {
  constructor(resource = 'Resource', data = null) {
    super(`${resource} not found`, 404, 'NOT_FOUND', data);
  }
}

class ResourceConflictError extends AppError {
  constructor(message = 'Resource already exists', data = null) {
    super(message, 409, 'CONFLICT', data);
  }
}

// Input Validation Errors
class ValidationError extends AppError {
  constructor(message = 'Validation failed', data = null) {
    super(message, 400, 'VALIDATION_ERROR', data);
  }
}

// Database/Service Errors
class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', data = null) {
    super(message, 500, 'DATABASE_ERROR', data);
  }
}

class ExternalServiceError extends AppError {
  constructor(service = 'External service', message = 'failed', data = null) {
    super(`${service} ${message}`, 502, 'EXTERNAL_SERVICE_ERROR', data);
  }
}

// General Error
class InternalServerError extends AppError {
  constructor(message = 'Internal server error', data = null) {
    super(message, 500, 'INTERNAL_SERVER_ERROR', data);
  }
}

module.exports = {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ResourceNotFoundError,
  ResourceConflictError,
  ValidationError,
  DatabaseError,
  ExternalServiceError,
  InternalServerError
};
